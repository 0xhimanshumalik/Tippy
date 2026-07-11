import "./style.css";
import QRCode from "qrcode";
import {
  isConnected,
  requestAccess,
  getNetwork,
  signTransaction,
} from "@stellar/freighter-api";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { TIP_JAR_ADDRESS, HORIZON_URL, EXPLORER_TX_URL } from "./config.js";

const server = new Horizon.Server(HORIZON_URL);

// ---------- UI elements ----------
const el = {
  tipjarAddress: document.getElementById("tipjar-address"),
  copyBtn: document.getElementById("copy-btn"),
  qrCanvas: document.getElementById("qr-canvas"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  freighterMissing: document.getElementById("freighter-missing"),
  walletDisconnected: document.getElementById("wallet-disconnected"),
  walletConnected: document.getElementById("wallet-connected"),
  walletAddress: document.getElementById("wallet-address"),
  walletBalance: document.getElementById("wallet-balance"),
  refreshBtn: document.getElementById("refresh-btn"),
  amountInput: document.getElementById("amount-input"),
  memoInput: document.getElementById("memo-input"),
  tipBtn: document.getElementById("tip-btn"),
  txStatus: document.getElementById("tx-status"),
  presets: document.querySelectorAll(".preset"),
};

// ---------- App state ----------
let connectedAddress = null;

// ---------- Helpers ----------
const shorten = (addr) => `${addr.slice(0, 6)}…${addr.slice(-6)}`;

function setStatus(kind, html) {
  el.txStatus.className = `status status-${kind}`;
  el.txStatus.innerHTML = html;
}

function clearStatus() {
  el.txStatus.className = "status hidden";
  el.txStatus.innerHTML = "";
}

function updateTipButton() {
  if (connectedAddress) {
    el.tipBtn.disabled = false;
    el.tipBtn.textContent = "Send tip";
  } else {
    el.tipBtn.disabled = true;
    el.tipBtn.textContent = "Connect wallet to tip";
  }
}

// ---------- Tip jar card ----------
function renderTipJar() {
  el.tipjarAddress.textContent = shorten(TIP_JAR_ADDRESS);
  el.tipjarAddress.title = TIP_JAR_ADDRESS;

  // SEP-0007 payment URI so wallet apps that scan the code open a
  // pre-filled payment to the tip jar.
  const uri = `web+stellar:pay?destination=${TIP_JAR_ADDRESS}`;
  QRCode.toCanvas(el.qrCanvas, uri, { width: 200, margin: 2 });
}

async function copyAddress() {
  await navigator.clipboard.writeText(TIP_JAR_ADDRESS);
  el.copyBtn.textContent = "Copied!";
  setTimeout(() => (el.copyBtn.textContent = "Copy"), 1500);
}

// ---------- Wallet connection ----------
async function connectWallet() {
  clearStatus();
  el.connectBtn.disabled = true;
  el.connectBtn.textContent = "Connecting…";
  try {
    const connection = await isConnected();
    if (!connection.isConnected) {
      el.freighterMissing.classList.remove("hidden");
      return;
    }

    const access = await requestAccess();
    if (access.error) {
      setStatus("error", `Connection failed: ${access.error}`);
      return;
    }

    const network = await getNetwork();
    if (network.network !== "TESTNET") {
      setStatus(
        "error",
        "Freighter is not on Testnet. Open Freighter → network selector → choose <strong>Test Net</strong>, then reconnect."
      );
      return;
    }

      connectedAddress = access.address;
    el.walletAddress.textContent = shorten(connectedAddress);
    el.walletAddress.title = connectedAddress;
    el.walletDisconnected.classList.add("hidden");
    el.walletConnected.classList.remove("hidden");
    updateTipButton();
    await refreshBalance();
  } finally {
    el.connectBtn.disabled = false;
    el.connectBtn.textContent = "Connect Freighter";
  }
}

function disconnectWallet() {
  // Freighter has no programmatic "revoke" — clearing local session state is
  // the standard disconnect behaviour for dapps.
  connectedAddress = null;
  el.walletConnected.classList.add("hidden");
  el.walletDisconnected.classList.remove("hidden");
  el.walletBalance.textContent = "—";
  clearStatus();
  updateTipButton();
}

// ---------- Balance ----------
async function refreshBalance() {
  if (!connectedAddress) return;
  el.walletBalance.textContent = "Loading…";
  try {
    const account = await server.loadAccount(connectedAddress);
    const native = account.balances.find((b) => b.asset_type === "native");
    el.walletBalance.textContent = native
      ? `${Number(native.balance).toLocaleString(undefined, {
          maximumFractionDigits: 7,
        })} XLM`
      : "0 XLM";
  } catch (err) {
    if (err?.response?.status === 404) {
      el.walletBalance.textContent = "0 XLM (account not funded)";
    } else {
      el.walletBalance.textContent = "Failed to load";
    }
  }
}

// ---------- Transaction flow ----------
async function sendTip() {
  clearStatus();

  const amount = el.amountInput.value.trim();
  if (!amount || Number(amount) <= 0) {
    setStatus("error", "Enter a tip amount greater than 0.");
    return;
  }
  if (connectedAddress === TIP_JAR_ADDRESS) {
    setStatus("error", "You are connected as the tip jar account — connect a different wallet to send a tip.");
    return;
  }

  el.tipBtn.disabled = true;
  el.tipBtn.textContent = "Sending…";

  try {
    // 1. Load the sender account for its current sequence number
    setStatus("pending", "Building transaction…");
    const sourceAccount = await server.loadAccount(connectedAddress);

    // 2. Build the payment transaction
    const builder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: TIP_JAR_ADDRESS,
          asset: Asset.native(),
          amount,
        })
      )
      .setTimeout(180);

    const memoText = el.memoInput.value.trim();
    if (memoText) builder.addMemo(Memo.text(memoText));

    const tx = builder.build();

    // 3. Ask Freighter to sign
    setStatus("pending", "Waiting for signature in Freighter…");
    const signed = await signTransaction(tx.toXDR(), {
      networkPassphrase: Networks.TESTNET,
      address: connectedAddress,
    });
    if (signed.error) {
      throw new Error(signed.error.message ?? String(signed.error));
    }

    // 4. Submit to Horizon
    setStatus("pending", "Submitting to the network…");
    const signedTx = TransactionBuilder.fromXDR(
      signed.signedTxXdr,
      Networks.TESTNET
    );
    const result = await server.submitTransaction(signedTx);

    // 5. Success feedback
    setStatus(
      "success",
      `✅ Tip sent! Thank you!<br />
       <span class="tx-hash">Transaction hash:
         <a href="${EXPLORER_TX_URL}${result.hash}" target="_blank" rel="noreferrer">
           ${result.hash}
         </a>
       </span>`
    );
    el.amountInput.value = "";
    el.memoInput.value = "";
    await refreshBalance();
  } catch (err) {
    // Failure feedback — surface the most useful message we can find
    const horizonCodes =
      err?.response?.data?.extras?.result_codes;
    let reason = horizonCodes
      ? JSON.stringify(horizonCodes)
      : err?.message ?? "Unknown error";
    if (/User declined/i.test(reason)) reason = "Request rejected in Freighter.";
    if (/underfunded/.test(reason)) reason = "Insufficient XLM balance for this tip.";
    setStatus("error", `❌ Transaction failed: ${reason}`);
  } finally {
    updateTipButton();
  }
}

// ---------- Wire up ----------
el.copyBtn.addEventListener("click", copyAddress);
el.connectBtn.addEventListener("click", connectWallet);
el.disconnectBtn.addEventListener("click", disconnectWallet);
el.refreshBtn.addEventListener("click", refreshBalance);
el.tipBtn.addEventListener("click", sendTip);
el.presets.forEach((btn) =>
  btn.addEventListener("click", () => {
    el.amountInput.value = btn.dataset.amount;
  })
);

renderTipJar();
updateTipButton();
