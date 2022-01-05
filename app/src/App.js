import './App.css';
import { useState } from 'react';
import LoadingSpinner from './components/LoadingSpinner'
import idl from './idl.json';
import { Connection,  PublicKey, SystemProgram, Transaction, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, Token } from  "@solana/spl-token";
import * as anchor from '@project-serum/anchor';
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


const escrowAccount = Keypair.generate();
const payer = Keypair.generate();
const mintAuthority = Keypair.generate();
const takerMainAccount = Keypair.generate();
const opts = {
  preflightCommitment: "processed"
};
const programID = new PublicKey(idl.metadata.address);

function App() {
  const [takerAmount, setTakerAmount] = useState('');
  const [initializerAmount, setInitializerAmount] = useState('');
  const [loading, setLoading] = useState(false);


  const wallet = useWallet();

  async function getProvider() {
    const network = "http://127.0.0.1:8899";
    const connection = new Connection(network, opts.preflightCommitment);

    const provider = new anchor.Provider(
      connection, wallet, opts.preflightCommitment,
    );
    return provider;
  }

  async function initialize(event) {
    event.preventDefault();
    setLoading(true);
    const provider = await getProvider();
    try {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(payer.publicKey, 100000000000),
        "confirmed"
      );
  
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
        [payer] 
      );
  
      mintA = await Token.createMint(
        provider.connection,   
        payer,       
        mintAuthority.publicKey,   
        null,          
        0,                
        TOKEN_PROGRAM_ID   
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
        initializerTokenAccountA, 
        mintAuthority.publicKey,   
        [mintAuthority],           
        initializerAmount         
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
    setLoading(false);
  }


  async function initEscrow(event) {
    event.preventDefault();
    setLoading(true);
    const provider = await getProvider();
    const program = new anchor.Program(idl, programID, provider);
    try {
      const [_vault_account_pda, _vault_account_bump] = await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("token-seed"))],
        program.programId
      );
      vault_account_pda = _vault_account_pda;
      vault_account_bump = _vault_account_bump;
      const [_vault_authority_pda, _vault_authority_bump] = await PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))],
        program.programId
      );
      vault_authority_pda = _vault_authority_pda;
  
      await program.rpc.initialize(
        vault_account_bump,
        new anchor.BN(initializerAmount), 
        new anchor.BN(takerAmount),         
        {
          accounts: {
            initializer: provider.wallet.publicKey,
            vaultAccount: vault_account_pda,
            mint: mintA.publicKey,
            initializerDepositTokenAccount: initializerTokenAccountA,
            initializerReceiveTokenAccount: initializerTokenAccountB,
            escrowAccount: escrowAccount.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
          instructions: [
            await program.account.escrowAccount.createInstruction(escrowAccount),
          ],
          signers: [escrowAccount],
        }
      );
  
      let _vault = await mintA.getAccountInfo(vault_account_pda);
      let _escrowAccount = await program.account.escrowAccount.fetch(
        escrowAccount.publicKey
      );
      console.log(_vault.owner.equals(vault_authority_pda));

    console.log(_escrowAccount.initializerKey.equals(provider.wallet.publicKey));
    console.log(_escrowAccount.initializerAmount.toNumber() == initializerAmount);
    console.log(_escrowAccount.takerAmount.toNumber() == takerAmount);
    console.log(
      _escrowAccount.initializerDepositTokenAccount.equals(initializerTokenAccountA)
    );
    console.log(
      _escrowAccount.initializerReceiveTokenAccount.equals(initializerTokenAccountB)
    );
    } catch (err) {
      console.log("Transaction error: ", err);
    }
    setLoading(false);
  }

  async function exEscrow(event) {
    event.preventDefault();
    setLoading(true);
    const provider = await getProvider();
    const program = new anchor.Program(idl, programID, provider);
    try {
      await program.rpc.exchange({
        accounts: {
          taker: takerMainAccount.publicKey,
          takerDepositTokenAccount: takerTokenAccountB,
          takerReceiveTokenAccount: takerTokenAccountA,
          initializerDepositTokenAccount: initializerTokenAccountA,
          initializerReceiveTokenAccount: initializerTokenAccountB,
          initializer: provider.wallet.publicKey,
          escrowAccount: escrowAccount.publicKey,
          vaultAccount: vault_account_pda,
          vaultAuthority: vault_authority_pda,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [takerMainAccount]
      });
  
      let _takerTokenAccountA = await mintA.getAccountInfo(takerTokenAccountA);
      let _takerTokenAccountB = await mintB.getAccountInfo(takerTokenAccountB);
      let _initializerTokenAccountA = await mintA.getAccountInfo(initializerTokenAccountA);
      let _initializerTokenAccountB = await mintB.getAccountInfo(initializerTokenAccountB);
  
      console.log(_takerTokenAccountA.amount.toNumber() == initializerAmount);
      console.log(_initializerTokenAccountA.amount.toNumber() == 0);
      console.log(_initializerTokenAccountB.amount.toNumber() == takerAmount);
      console.log(_takerTokenAccountB.amount.toNumber() == 0);
    } catch (err) {
      console.log("Transaction error: ", err);
    }
    setLoading(false);
  }


  async function cancelEscrow(event) {
    event.preventDefault();
    setLoading(true);
    const provider = await getProvider();
    const program = new anchor.Program(idl, programID, provider);
    try {
      await program.rpc.cancel({
        accounts: {
          initializer: provider.wallet.publicKey,
          initializerDepositTokenAccount: initializerTokenAccountA,
          vaultAccount: vault_account_pda,
          vaultAuthority: vault_authority_pda,
          escrowAccount: escrowAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        }
      });
      const _initializerTokenAccountA = await mintA.getAccountInfo(initializerTokenAccountA);
      console.log(_initializerTokenAccountA.owner.equals(provider.wallet.publicKey));
  
      console.log(_initializerTokenAccountA.amount.toNumber() == initializerAmount);
    } catch (err) {
      console.log("Transaction error: ", err);
    }
    setLoading(false);
  }

  
  const initChangeHandler = (event) => {
    setInitializerAmount(event.target.value);
  };

  const takeChangeHandler = (event) => {
    setTakerAmount(event.target.value);
  };


  if (!wallet.connected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop:'100px' }}>
        <WalletMultiButton />
      </div>
    )
  } else {
    return (
      <div className="App">
      {loading && <LoadingSpinner />}
        <div className="mt-4 container border border-primary">
        <form className='m-4 p-4'>
  <div className="mb-3">
    <label htmlFor="initAmount" className="form-label">Initializer Pay Account</label>
    <input type="text" className="form-control" id="initAmount" aria-describedby="initAmount"  
    placeholder="Initializer Amounts"
    required={true} 
    value={initializerAmount}
    onChange={initChangeHandler}/>
    <div  className="form-text">Enter the amount you want to store in vault.</div>
  </div>
  <div className="mb-3">
    <label htmlFor="takeAmount" className="form-label">Taker Pay Account</label>
    <input type="text" className="form-control" id="takeAmount" aria-describedby="takeAmount"
    placeholder="Taker Amounts"
    required={true}  
    value={takerAmount}
    onChange={takeChangeHandler}/>
    <div  className="form-text">Enter the amount Taker wants to store in vault.</div>
  </div>
  
  <button className="btn btn-primary" onClick={initialize}>Submit</button>
</form>
        </div>
{/* ----------------------------------------- */}
        <div className="mt-4 container border border-danger">
        <h1>Initialize/Cancel Escrow</h1>
        <form className='m-4 p-4'>
  <div className="mb-3">
    <label htmlFor="initAmount" className="form-label">Initializer Ammount</label>
    <input type="text" className="form-control" id="initAmount" aria-describedby="initAmount"  
    placeholder="Initializer Amounts"
    required={true}
    value={initializerAmount} 
    onChange={initChangeHandler}/>
    <div  className="form-text">Enter the amount you want to store in vault.</div>
  </div>
  <div className="mb-3">
    <label htmlFor="takeAmount" className="form-label">Taker Ammount</label>
    <input type="text" className="form-control" id="takeAmount" aria-describedby="takeAmount"
    placeholder="Taker Amounts"
    required={true}
    value={takerAmount}  
    onChange={takeChangeHandler}/>
    <div  className="form-text">Enter the amount Taker wants to store in vault.</div>
  </div>
  <button className="btn btn-primary mx-2" onClick={initEscrow}>Initiate Escrow</button>
  <button className="btn btn-primary mx-2" onClick={cancelEscrow}>Cancel Escrow</button>
</form>
        </div>


        {/* ----------------------------------------- */}

        <div className="my-4 container border border-dark">
        <h1>Exchange</h1>
        <form className='m-4 p-4'>
  <div className="mb-3">
    <label htmlFor="initAmount" className="form-label">Initializer Ammount</label>
    <input type="text" className="form-control" id="initAmount" aria-describedby="initAmount"  
    placeholder="Initializer Amounts"
    required={true}
    value={initializerAmount} 
    onChange={initChangeHandler}/>
    <div  className="form-text">Enter the amount you want to store in vault.</div>
  </div>
  <div className="mb-3">
    <label htmlFor="takeAmount" className="form-label">Taker Ammount</label>
    <input type="text" className="form-control" id="takeAmount" aria-describedby="takeAmount"
    placeholder="Taker Amounts"
    required={true}
    value={takerAmount}  
    onChange={takeChangeHandler}/>
    <div  className="form-text">Enter the amount Taker wants to store in vault.</div>
  </div>
  <button className="btn btn-primary mx-2" onClick={exEscrow}>Exchange Escrow</button>
</form>
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