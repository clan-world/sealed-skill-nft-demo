use anchor_lang::prelude::*;
use anchor_lang::solana_program::{account_info::next_account_info, program_error::ProgramError};
use spl_token_2022::{
    extension::{transfer_hook::TransferHookAccount, BaseStateWithExtensions, StateWithExtensions},
    state::Account as TokenAccount,
};

const TRANSFER_HOOK_EXECUTE_DISCRIMINATOR: [u8; 8] = [105, 37, 101, 197, 75, 251, 102, 26];

declare_id!("APpCcBAPBAn92mz8KLv3RgFTqLKHMyMAvepudiUpNb6s");

#[program]
pub mod sealed_skill {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn register_tee(
        ctx: Context<RegisterTee>,
        role: u8,
        sign_key_hash: [u8; 32],
        wrap_key_hash: [u8; 32],
        measurement: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.admin, ctx.accounts.admin.key(), SealedSkillError::NotAdmin);
        let tee = &mut ctx.accounts.tee;
        tee.role = role;
        tee.sign_key_hash = sign_key_hash;
        tee.wrap_key_hash = wrap_key_hash;
        tee.measurement = measurement;
        tee.expires_at = expires_at;
        tee.revoked = false;
        Ok(())
    }

    pub fn revoke_tee(ctx: Context<RevokeTee>) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.admin, ctx.accounts.admin.key(), SealedSkillError::NotAdmin);
        ctx.accounts.tee.revoked = true;
        Ok(())
    }

    pub fn register_artifact(
        ctx: Context<RegisterArtifact>,
        artifact_id_hash: [u8; 32],
        encrypted_blob_hash: [u8; 32],
        runtime_policy_hash: [u8; 32],
    ) -> Result<()> {
        let artifact = &mut ctx.accounts.artifact;
        artifact.artifact_id_hash = artifact_id_hash;
        artifact.nft_mint = ctx.accounts.nft_mint.key();
        artifact.owner = ctx.accounts.owner.key();
        artifact.encrypted_blob_hash = encrypted_blob_hash;
        artifact.runtime_policy_hash = runtime_policy_hash;
        artifact.epoch = 1;
        Ok(())
    }

    pub fn register_minted_artifact(
        ctx: Context<RegisterMintedArtifact>,
        artifact_id_hash: [u8; 32],
        encrypted_blob_hash: [u8; 32],
        runtime_policy_hash: [u8; 32],
        owner: Pubkey,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        if cfg.admin == Pubkey::default() {
            cfg.admin = ctx.accounts.admin.key();
            cfg.bump = ctx.bumps.config;
        }
        require_keys_eq!(cfg.admin, ctx.accounts.admin.key(), SealedSkillError::NotAdmin);

        let artifact = &mut ctx.accounts.artifact;
        artifact.artifact_id_hash = artifact_id_hash;
        artifact.nft_mint = ctx.accounts.nft_mint.key();
        artifact.owner = owner;
        artifact.encrypted_blob_hash = encrypted_blob_hash;
        artifact.runtime_policy_hash = runtime_policy_hash;
        artifact.epoch = 1;
        Ok(())
    }

    pub fn record_transfer_approval(
        ctx: Context<RecordTransferApproval>,
        to_owner: Pubkey,
        capsule_hash: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.admin, ctx.accounts.admin.key(), SealedSkillError::NotAdmin);
        require_keys_eq!(ctx.accounts.artifact.nft_mint, ctx.accounts.nft_mint.key(), SealedSkillError::WrongMint);
        let approval = &mut ctx.accounts.approval;
        approval.artifact = ctx.accounts.artifact.key();
        approval.nft_mint = ctx.accounts.nft_mint.key();
        approval.from_owner = ctx.accounts.artifact.owner;
        approval.to_owner = to_owner;
        approval.epoch = ctx.accounts.artifact.epoch;
        approval.next_epoch = ctx.accounts.artifact.epoch.checked_add(1).ok_or(SealedSkillError::Overflow)?;
        approval.capsule_hash = capsule_hash;
        approval.expires_at = expires_at;
        approval.consumed = false;
        approval.active = false;
        Ok(())
    }

    pub fn begin_broker_transfer(ctx: Context<BeginBrokerTransfer>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require_keys_eq!(ctx.accounts.artifact.nft_mint, ctx.accounts.nft_mint.key(), SealedSkillError::WrongMint);
        require_keys_eq!(ctx.accounts.artifact.owner, ctx.accounts.owner.key(), SealedSkillError::WrongCurrentOwner);
        require!(!ctx.accounts.approval.consumed, SealedSkillError::ApprovalConsumed);
        require!(ctx.accounts.approval.expires_at > now, SealedSkillError::ApprovalExpired);
        require_keys_eq!(ctx.accounts.approval.artifact, ctx.accounts.artifact.key(), SealedSkillError::WrongApproval);
        require_keys_eq!(ctx.accounts.approval.from_owner, ctx.accounts.owner.key(), SealedSkillError::WrongCurrentOwner);
        require_keys_eq!(ctx.accounts.approval.nft_mint, ctx.accounts.nft_mint.key(), SealedSkillError::WrongMint);
        require_eq!(ctx.accounts.approval.epoch, ctx.accounts.artifact.epoch, SealedSkillError::WrongEpoch);
        ctx.accounts.approval.active = true;
        Ok(())
    }

    pub fn initialize_extra_account_metas(ctx: Context<InitializeExtraAccountMetas>, data: Vec<u8>) -> Result<()> {
        let target = &mut ctx.accounts.extra_account_metas.try_borrow_mut_data()?;
        require!(target.len() == data.len(), SealedSkillError::WrongExtraAccountMetasSize);
        target.copy_from_slice(&data);
        Ok(())
    }

    pub fn initialize_transfer_policy(ctx: Context<InitializeTransferPolicy>, mode: u8) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.admin, ctx.accounts.admin.key(), SealedSkillError::NotAdmin);
        let policy = &mut ctx.accounts.transfer_policy;
        policy.nft_mint = ctx.accounts.nft_mint.key();
        policy.mode = TransferMode::try_from(mode)?;
        policy.bump = ctx.bumps.transfer_policy;
        Ok(())
    }

    pub fn consume_transfer_approval(ctx: Context<ConsumeTransferApproval>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(!ctx.accounts.approval.consumed, SealedSkillError::ApprovalConsumed);
        require!(ctx.accounts.approval.expires_at > now, SealedSkillError::ApprovalExpired);
        require_keys_eq!(ctx.accounts.approval.to_owner, ctx.accounts.new_owner.key(), SealedSkillError::WrongNewOwner);
        let artifact = &mut ctx.accounts.artifact;
        artifact.owner = ctx.accounts.new_owner.key();
        artifact.epoch = ctx.accounts.approval.next_epoch;
        ctx.accounts.approval.consumed = true;
        Ok(())
    }

    pub fn transfer_hook(_program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> Result<()> {
        handle_transfer_hook(accounts, data).map_err(Into::into)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + ProtocolConfig::SIZE, seeds = [b"config"], bump)]
    pub config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(role: u8)]
pub struct RegisterTee<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(init_if_needed, payer = admin, space = 8 + TeeRegistryEntry::SIZE, seeds = [b"tee".as_ref(), &[role]], bump)]
    pub tee: Account<'info, TeeRegistryEntry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeTee<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub tee: Account<'info, TeeRegistryEntry>,
}

#[derive(Accounts)]
pub struct RegisterArtifact<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: Only stored as identity of the demo NFTee mint.
    pub nft_mint: UncheckedAccount<'info>,
    #[account(init, payer = owner, space = 8 + ArtifactAccount::SIZE, seeds = [b"artifact", nft_mint.key().as_ref()], bump)]
    pub artifact: Account<'info, ArtifactAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterMintedArtifact<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init_if_needed, payer = admin, space = 8 + ProtocolConfig::SIZE, seeds = [b"config"], bump)]
    pub config: Account<'info, ProtocolConfig>,
    /// CHECK: Stored as identity of the Token-2022 NFTee mint.
    pub nft_mint: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = admin, space = 8 + ArtifactAccount::SIZE, seeds = [b"artifact", nft_mint.key().as_ref()], bump)]
    pub artifact: Account<'info, ArtifactAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordTransferApproval<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    /// CHECK: Stored in the approval and compared to the artifact mint.
    pub nft_mint: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"artifact", nft_mint.key().as_ref()], bump)]
    pub artifact: Account<'info, ArtifactAccount>,
    #[account(init_if_needed, payer = admin, space = 8 + TransferApproval::SIZE, seeds = [b"approval", nft_mint.key().as_ref()], bump)]
    pub approval: Account<'info, TransferApproval>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BeginBrokerTransfer<'info> {
    pub owner: Signer<'info>,
    /// CHECK: Compared to the artifact and approval mint.
    pub nft_mint: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"artifact", nft_mint.key().as_ref()], bump)]
    pub artifact: Account<'info, ArtifactAccount>,
    #[account(mut, seeds = [b"approval", nft_mint.key().as_ref()], bump)]
    pub approval: Account<'info, TransferApproval>,
}

#[derive(Accounts)]
#[instruction(data: Vec<u8>)]
pub struct InitializeExtraAccountMetas<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Used only as PDA seed for the Transfer Hook validation account.
    pub nft_mint: UncheckedAccount<'info>,
    /// CHECK: Raw TLV account consumed by Token-2022 transfer hook resolution.
    #[account(init_if_needed, payer = admin, space = data.len(), seeds = [b"extra-account-metas", nft_mint.key().as_ref()], bump)]
    pub extra_account_metas: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeTransferPolicy<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    /// CHECK: Stored in the policy and compared in the transfer hook.
    pub nft_mint: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = admin, space = 8 + TransferPolicyAccount::SIZE, seeds = [b"transfer-policy", nft_mint.key().as_ref()], bump)]
    pub transfer_policy: Account<'info, TransferPolicyAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConsumeTransferApproval<'info> {
    pub new_owner: Signer<'info>,
    #[account(mut)]
    pub artifact: Account<'info, ArtifactAccount>,
    #[account(mut)]
    pub approval: Account<'info, TransferApproval>,
}

#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub bump: u8,
}
impl ProtocolConfig { pub const SIZE: usize = 32 + 1; }

#[account]
pub struct TeeRegistryEntry {
    pub role: u8,
    pub sign_key_hash: [u8; 32],
    pub wrap_key_hash: [u8; 32],
    pub measurement: [u8; 32],
    pub expires_at: i64,
    pub revoked: bool,
}
impl TeeRegistryEntry { pub const SIZE: usize = 1 + 32 + 32 + 32 + 8 + 1; }

#[account]
pub struct ArtifactAccount {
    pub artifact_id_hash: [u8; 32],
    pub nft_mint: Pubkey,
    pub owner: Pubkey,
    pub encrypted_blob_hash: [u8; 32],
    pub runtime_policy_hash: [u8; 32],
    pub epoch: u64,
}
impl ArtifactAccount { pub const SIZE: usize = 32 + 32 + 32 + 32 + 32 + 8; }

#[account]
pub struct TransferApproval {
    pub artifact: Pubkey,
    pub nft_mint: Pubkey,
    pub from_owner: Pubkey,
    pub to_owner: Pubkey,
    pub epoch: u64,
    pub next_epoch: u64,
    pub capsule_hash: [u8; 32],
    pub expires_at: i64,
    pub consumed: bool,
    pub active: bool,
}
impl TransferApproval { pub const SIZE: usize = 32 + 32 + 32 + 32 + 8 + 8 + 32 + 8 + 1 + 1; }

#[account]
pub struct TransferPolicyAccount {
    pub nft_mint: Pubkey,
    pub mode: TransferMode,
    pub bump: u8,
}
impl TransferPolicyAccount { pub const SIZE: usize = 32 + 1 + 1; }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TransferMode { BrokerGated, Open }

impl TryFrom<u8> for TransferMode {
    type Error = Error;

    fn try_from(value: u8) -> Result<Self> {
        match value {
            0 => Ok(TransferMode::BrokerGated),
            1 => Ok(TransferMode::Open),
            _ => err!(SealedSkillError::InvalidTransferPolicy),
        }
    }
}

#[error_code]
pub enum SealedSkillError {
    #[msg("Only protocol admin can do this in the MVP scaffold")]
    NotAdmin,
    #[msg("Transfer approval already consumed")]
    ApprovalConsumed,
    #[msg("Transfer approval expired")]
    ApprovalExpired,
    #[msg("Wrong new owner")]
    WrongNewOwner,
    #[msg("Wrong current owner")]
    WrongCurrentOwner,
    #[msg("Wrong mint")]
    WrongMint,
    #[msg("Wrong approval")]
    WrongApproval,
    #[msg("Wrong epoch")]
    WrongEpoch,
    #[msg("Broker approval required before transfer")]
    BrokerApprovalRequired,
    #[msg("Transfer hook requires the broker approval accounts")]
    MissingHookAccounts,
    #[msg("Transfer amount must be exactly one NFTee")]
    InvalidTransferAmount,
    #[msg("Wrong extra account metas account size")]
    WrongExtraAccountMetasSize,
    #[msg("Invalid transfer policy")]
    InvalidTransferPolicy,
    #[msg("Invalid transfer hook account")]
    InvalidHookAccount,
    #[msg("Transfer hook must be invoked by Token-2022 during a transfer")]
    InvalidTransferContext,
    #[msg("Overflow")]
    Overflow,
}

fn handle_transfer_hook(accounts: &[AccountInfo], data: &[u8]) -> std::result::Result<(), ProgramError> {
    if data.len() < 16 || data[..8] != TRANSFER_HOOK_EXECUTE_DISCRIMINATOR {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut amount_bytes = [0u8; 8];
    amount_bytes.copy_from_slice(&data[8..16]);
    execute_transfer_hook(accounts, u64::from_le_bytes(amount_bytes))
}

fn execute_transfer_hook(accounts: &[AccountInfo], amount: u64) -> std::result::Result<(), ProgramError> {
    if amount != 1 {
        return Err(error!(SealedSkillError::InvalidTransferAmount).into());
    }
    if accounts.len() < 7 {
        return Err(error!(SealedSkillError::MissingHookAccounts).into());
    }

    let account_iter = &mut accounts.iter();
    let source_info = next_account_info(account_iter)?;
    let mint_info = next_account_info(account_iter)?;
    let destination_info = next_account_info(account_iter)?;
    let authority_info = next_account_info(account_iter)?;
    let validation_info = next_account_info(account_iter)?;
    let artifact_info = next_account_info(account_iter)?;
    let policy_or_approval_info = next_account_info(account_iter)?;

    let expected_validation = Pubkey::find_program_address(&[b"extra-account-metas", mint_info.key.as_ref()], &crate::ID).0;
    let expected_artifact = Pubkey::find_program_address(&[b"artifact", mint_info.key.as_ref()], &crate::ID).0;
    let expected_policy = Pubkey::find_program_address(&[b"transfer-policy", mint_info.key.as_ref()], &crate::ID).0;
    let expected_approval = Pubkey::find_program_address(&[b"approval", mint_info.key.as_ref()], &crate::ID).0;

    if *validation_info.key != expected_validation || *artifact_info.key != expected_artifact {
        return Err(error!(SealedSkillError::InvalidHookAccount).into());
    }
    if *policy_or_approval_info.key != expected_policy && *policy_or_approval_info.key != expected_approval {
        return Err(error!(SealedSkillError::InvalidHookAccount).into());
    }

    let source_data = source_info.try_borrow_data()?;
    let destination_data = destination_info.try_borrow_data()?;
    let source_state = StateWithExtensions::<TokenAccount>::unpack(&source_data)?;
    let destination_state = StateWithExtensions::<TokenAccount>::unpack(&destination_data)?;
    let source_hook = source_state
        .get_extension::<TransferHookAccount>()
        .map_err(|_| error!(SealedSkillError::InvalidTransferContext))?;
    let destination_hook = destination_state
        .get_extension::<TransferHookAccount>()
        .map_err(|_| error!(SealedSkillError::InvalidTransferContext))?;
    if !bool::from(source_hook.transferring) || !bool::from(destination_hook.transferring) {
        return Err(error!(SealedSkillError::InvalidTransferContext).into());
    }
    let source = source_state.base;
    let destination = destination_state.base;

    if source.mint != *mint_info.key || destination.mint != *mint_info.key {
        return Err(error!(SealedSkillError::WrongMint).into());
    }

    let mut artifact = {
        let data = artifact_info.try_borrow_data()?;
        let mut slice: &[u8] = &data;
        ArtifactAccount::try_deserialize(&mut slice).map_err(|_| ProgramError::InvalidAccountData)?
    };

    if artifact.nft_mint != *mint_info.key {
        return Err(error!(SealedSkillError::WrongMint).into());
    }

    let policy = if *policy_or_approval_info.key == expected_policy {
        let data = policy_or_approval_info.try_borrow_data()?;
        let mut slice: &[u8] = &data;
        Some(TransferPolicyAccount::try_deserialize(&mut slice).map_err(|_| ProgramError::InvalidAccountData)?)
    } else {
        None
    };
    let has_policy_account = policy.is_some();

    if let Some(policy) = policy {
        if policy.nft_mint != *mint_info.key {
            return Err(error!(SealedSkillError::WrongMint).into());
        }
        if policy.mode == TransferMode::Open {
            if source.owner != artifact.owner || source.owner != *authority_info.key {
                return Err(error!(SealedSkillError::WrongCurrentOwner).into());
            }
            artifact.owner = destination.owner;
            artifact.epoch = artifact.epoch.checked_add(1).ok_or(error!(SealedSkillError::Overflow))?;
            let mut data = artifact_info.try_borrow_mut_data()?;
            let mut writer = &mut data[..];
            artifact.try_serialize(&mut writer)?;
            return Ok(());
        }
    }

    let approval_info = if has_policy_account {
        let approval_info = next_account_info(account_iter)?;
        if *approval_info.key != expected_approval {
            return Err(error!(SealedSkillError::InvalidHookAccount).into());
        }
        approval_info
    } else {
        policy_or_approval_info
    };
    let mut approval = {
        let data = approval_info.try_borrow_data()?;
        let mut slice: &[u8] = &data;
        TransferApproval::try_deserialize(&mut slice).map_err(|_| ProgramError::InvalidAccountData)?
    };

    if approval.nft_mint != *mint_info.key {
        return Err(error!(SealedSkillError::WrongMint).into());
    }
    if approval.artifact != *artifact_info.key {
        return Err(error!(SealedSkillError::WrongApproval).into());
    }
    if !approval.active {
        msg!("BrokerApprovalRequired: run TEE1 broker transfer before a normal wallet transfer can succeed");
        return Err(error!(SealedSkillError::BrokerApprovalRequired).into());
    }
    if approval.consumed {
        return Err(error!(SealedSkillError::ApprovalConsumed).into());
    }
    if approval.epoch != artifact.epoch {
        return Err(error!(SealedSkillError::WrongEpoch).into());
    }
    if source.owner != approval.from_owner || source.owner != artifact.owner || source.owner != *authority_info.key {
        return Err(error!(SealedSkillError::WrongCurrentOwner).into());
    }
    if destination.owner != approval.to_owner {
        return Err(error!(SealedSkillError::WrongNewOwner).into());
    }

    let now = Clock::get()?.unix_timestamp;
    if approval.expires_at <= now {
        return Err(error!(SealedSkillError::ApprovalExpired).into());
    }

    artifact.owner = approval.to_owner;
    artifact.epoch = approval.next_epoch;
    approval.active = false;
    approval.consumed = true;

    {
        let mut data = artifact_info.try_borrow_mut_data()?;
        let mut writer = &mut data[..];
        artifact.try_serialize(&mut writer)?;
    }
    {
        let mut data = approval_info.try_borrow_mut_data()?;
        let mut writer = &mut data[..];
        approval.try_serialize(&mut writer)?;
    }

    Ok(())
}
