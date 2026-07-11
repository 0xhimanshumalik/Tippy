# 🫙 Tippy — Stellar Tip Jar

A static donation page on the **Stellar Testnet**. Visitors can scan a QR code
with any Stellar wallet, or connect their **Freighter** browser wallet to send
an **XLM** tip directly from the page.

## Features

- **QR code tip jar** — the page renders a [SEP-0007](https://stellar.org/protocol/sep-7)
  `web+stellar:pay` QR code pointing at the tip jar account, plus a copyable address.
- **Wallet connect / disconnect** — connect the Freighter extension with one
  click (the app verifies Freighter is on Testnet); disconnect clears the session.
- **Live XLM balance** — the connected wallet's native XLM balance is fetched
  from Horizon and shown in the UI, with a manual refresh button.
- **Send a tip** — builds a payment transaction with the Stellar SDK, asks
  Freighter to sign it, and submits it to Horizon. Supports preset amounts,
  custom amounts, and an optional text memo.
- **Transaction feedback** — pending / success / failure states in the UI,
  with the transaction hash linked to
  [stellar.expert](https://stellar.expert/explorer/testnet) on success and a
  human-readable reason on failure (rejected in wallet, insufficient balance,
  Horizon result codes, …).

## How it works

```
┌──────────┐   1. requestAccess()    ┌───────────┐
│  Tippy   │ ──────────────────────▶ │ Freighter │
│  (page)  │ ◀────────────────────── │  wallet   │
└──────────┘   public key (G...)     └───────────┘
      │
      │ 2. loadAccount(address)                ┌─────────────┐
      ├──────────────────────────────────────▶ │   Horizon   │
      │ ◀── balances + sequence number ─────── │  (testnet)  │
      │                                        └─────────────┘
      │ 3. TransactionBuilder → payment op (XLM → tip jar)
      │
      │ 4. signTransaction(xdr)     ┌───────────┐
      ├───────────────────────────▶ │ Freighter │  user approves
      │ ◀── signed XDR ──────────── └───────────┘
      │
      │ 5. submitTransaction(signedTx)          ┌─────────────┐
      └───────────────────────────────────────▶ │   Horizon   │
        ◀── tx hash (success) / result codes ── │  (testnet)  │
                                                └─────────────┘
```

1. **Connect** — the page calls Freighter's `requestAccess()`; the user approves
   and the app receives their public key. `getNetwork()` is checked to make
   sure Freighter is on **Testnet** before continuing.
2. **Balance** — the account is loaded from Horizon
   (`server.loadAccount(address)`) and the `native` (XLM) balance entry is
   shown in the UI.
3. **Build** — when the user hits *Send tip*, the app builds a transaction
   with `TransactionBuilder`: one `payment` operation (native XLM, chosen
   amount, tip jar as destination), base fee, optional text memo, 180s timeout.
4. **Sign** — the unsigned transaction XDR is handed to Freighter's
   `signTransaction()`. The private key never leaves the wallet; the page only
   gets back the signed XDR.
5. **Submit & feedback** — the signed transaction is submitted to Horizon.
   The UI walks through *Building → Waiting for signature → Submitting*, then
   shows the transaction hash (linked to the explorer) on success, or a
   readable failure reason (rejected in wallet, insufficient balance, Horizon
   result codes) on error.

All of this logic lives in [`src/main.js`](src/main.js) (`connectWallet`,
`refreshBalance`, `sendTip`).

## On-chain details

| Item | Value |
| --- | --- |
| Network | Stellar **Testnet** |
| Network passphrase | `Test SDF Network ; September 2015` |
| Horizon endpoint | `https://horizon-testnet.stellar.org` |
| Tip jar account | [`GDU2YY62DDHLO56TN6IMZ6MTWJRURU5M2R6U6YPHPYDQYUCI4Q3PB7ZC`](https://stellar.expert/explorer/testnet/account/GDU2YY62DDHLO56TN6IMZ6MTWJRURU5M2R6U6YPHPYDQYUCI4Q3PB7ZC) |
| Asset | Native XLM (lumens) |
| Operation type | `payment` |
| Explorer | [stellar.expert (testnet)](https://stellar.expert/explorer/testnet) |

> **Why no smart contract?** Tips are plain XLM transfers, which Stellar
> supports natively as `payment` operations — no Soroban contract is needed.
> Every tip is still fully on-chain and auditable: open the tip jar account on
> the explorer above to see each incoming payment with its amount, sender,
> memo, and transaction hash.

## Tech stack

- [Vite](https://vitejs.dev/) + vanilla JavaScript (no framework)
- [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) — transaction building & Horizon queries
- [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api) — wallet connection & signing
- [`qrcode`](https://www.npmjs.com/package/qrcode) — QR code rendering

## Prerequisites

1. **Node.js** ≥ 18 and npm
2. **Freighter wallet** — install the browser extension from
   [freighter.app](https://www.freighter.app/)
3. In Freighter, switch the network to **Test Net**
   (Settings → Network → Test Net)
4. Fund your testnet account with free test XLM using
   [Friendbot](https://laboratory.stellar.org/#account-creator?network=test)
   (paste your public key and click "Get test network lumens")

## Run locally

```bash
git clone <this-repo>
cd Tippy
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

To build for production:

```bash
npm run build     # outputs static files to dist/
npm run preview   # serve the production build locally
```

## Using the app

1. Click **Connect Freighter** and approve the connection in the extension.
2. Your address and XLM balance appear in the "Your wallet" card.
3. Pick a preset amount (or type your own), optionally add a message,
   and click **Send tip**.
4. Approve the transaction in Freighter.
5. The page shows the result — on success, the transaction hash links to the
   block explorer; on failure, the reason is displayed.

## Configuration

The tip jar (recipient) account lives in [`src/config.js`](src/config.js):

```js
export const TIP_JAR_ADDRESS = "GDU2YY62DDHLO56TN6IMZ6MTWJRURU5M2R6U6YPHPYDQYUCI4Q3PB7ZC";
```

Replace it with your own testnet public key to receive tips at a different
account (it must exist on testnet — fund it via Friendbot). You can verify
incoming tips on
[stellar.expert](https://stellar.expert/explorer/testnet/account/GDU2YY62DDHLO56TN6IMZ6MTWJRURU5M2R6U6YPHPYDQYUCI4Q3PB7ZC).

## Project structure

```
index.html          Page markup (tip jar, wallet, tip form cards)
src/config.js       Tip jar address + network endpoints
src/main.js         Wallet connection, balance fetch, transaction flow
src/style.css       Styling
```

## Notes

- Everything runs on the **Stellar Testnet** — no real funds are ever moved.
- "Disconnect" clears the app's session state; Freighter does not expose a
  programmatic revoke (you can remove the site under Freighter → Settings →
  Connected apps).
- Text memos are capped at 28 bytes by the Stellar protocol, hence the
  28-character limit on the message field.
