import './App.css';
import { useState } from 'react';



import { Connection,  PublicKey, SystemProgram, Transaction, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, Token } from  "@solana/spl-token";
import { Program, Provider, web3 } from '@project-serum/anchor';
import idl from './idl.json';

import { getPhantomWallet } from '@solana/wallet-adapter-wallets';
import { useWallet, WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
require('@solana/wallet-adapter-react-ui/styles.css');

const wallets = [ getPhantomWallet() ];

let mintA = null;
let mintB = null;
let initializerTokenAccountA = null;
let initializerTokenAccountB = null;
let takerTokenAccountA = null;
let takerTokenAccountB = null;
let vault_account_pda = null;
let vault_account_bump = null;
let vault_authority_pda = null;

const takerAmount = 1000;
const initializerAmount = 500;

const escrowAccount = Keypair.generate();
const payer = Keypair.generate();
const mintAuthority = Keypair.generate();
const takerMainAccount = Keypair.generate();
const opts = {
  preflightCommitment: "processed"
};
const programID = new PublicKey(idl.metadata.address);

function App() {
  // const [value, setValue] = useState('');
  // const [dataList, setDataList] = useState([]);
  // const [input, setInput] = useState('');
  const wallet = useWallet();

  async function getProvider() {
    const network = "http://127.0.0.1:8899";
    const connection = new Connection(network, opts.preflightCommitment);

    const provider = new Provider(
      connection, wallet, opts.preflightCommitment,
    );
    return provider;
  }

  async function initialize() {    
    const provider = await getProvider();
    /* create the program interface combining the idl, program ID, and provider */
    const program = new Program(idl, programID, provider);
    try {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(payer.publicKey, 100000000000),
        "confirmed"
      );
  
      // Fund Main Accounts
      await provider.send(
        (() => {
          const tx = new Transaction();
          tx.add(
            SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey:  provider.wallet.publicKey,
              lamports: 1000000000,
            }),
            SystemProgram.transfer({
              fromPubkey: payer.publicKey,
              toPubkey: takerMainAccount.publicKey,
              lamports: 1000000000,
            })
          );
          return tx;
        })(),
        [payer] //sign of payer
      );
  
      mintA = await Token.createMint(
        provider.connection,   //connection
        payer,        //signer
        mintAuthority.publicKey,   //mint authority
        null,          //freze authority
        0,                //number
        TOKEN_PROGRAM_ID   //program id
      );
  
      mintB = await Token.createMint(
        provider.connection,
        payer,
        mintAuthority.publicKey,
        null,
        0,
        TOKEN_PROGRAM_ID
      );
  
      initializerTokenAccountA = await mintA.createAccount(provider.wallet.publicKey);
      takerTokenAccountA = await mintA.createAccount(takerMainAccount.publicKey);
  
      initializerTokenAccountB = await mintB.createAccount(provider.wallet.publicKey);
      takerTokenAccountB = await mintB.createAccount(takerMainAccount.publicKey);
  
      await mintA.mintTo(
        initializerTokenAccountA,  //to
        mintAuthority.publicKey,   //authority
        [mintAuthority],           //authority signature
        initializerAmount         //amount
      );
  
      await mintB.mintTo(
        takerTokenAccountB,
        mintAuthority.publicKey,
        [mintAuthority],
        takerAmount
      );
  
      let _initializerTokenAccountA = await mintA.getAccountInfo(initializerTokenAccountA);
      let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);
  

      console.log(_initializerTokenAccountA.amount.toNumber())
      console.log( _takerTokenAccountB.amount.toNumber())
    } catch (err) {
      console.log("Transaction error: ", err);
    }
  }



  if (!wallet.connected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop:'100px' }}>
        <WalletMultiButton />
      </div>
    )
  } else {
    return (
      <div className="App">
        <div>
<button onClick={initialize}>Initialize</button>)
         
        </div>
      </div>
    );
  }
}

const AppWithProvider = () => (
  <ConnectionProvider endpoint="http://127.0.0.1:8899">
    <WalletProvider wallets={wallets} autoConnect>
      <WalletModalProvider>
        <App />
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
)

export default AppWithProvider; 