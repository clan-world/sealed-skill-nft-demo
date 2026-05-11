use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgTsrYecUQvP");

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

    pub fn record_transfer_approval(
        ctx: Context<RecordTransferApproval>,
        to_owner: Pubkey,
        capsule_hash: [u8; 32],
        expires_at: i64,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.config.admin, ctx.accounts.admin.key(), SealedSkillError::NotAdmin);
        let approval = &mut ctx.accounts.approval;
        approval.artifact = ctx.accounts.artifact.key();
        approval.from_owner = ctx.accounts.artifact.owner;
        approval.to_owner = to_owner;
        approval.epoch = ctx.accounts.artifact.epoch;
        approval.next_epoch = ctx.accounts.artifact.epoch.checked_add(1).ok_or(SealedSkillError::Overflow)?;
        approval.capsule_hash = capsule_hash;
        approval.expires_at = expires_at;
        approval.consumed = false;
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
pub struct RegisterTee<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(init_if_needed, payer = admin, space = 8 + TeeRegistryEntry::SIZE, seeds = [b"tee", &[role]], bump)]
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
    /// CHECK: Only stored as identity of the demo NFT mint.
    pub nft_mint: UncheckedAccount<'info>,
    #[account(init, payer = owner, space = 8 + ArtifactAccount::SIZE, seeds = [b"artifact", nft_mint.key().as_ref()], bump)]
    pub artifact: Account<'info, ArtifactAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordTransferApproval<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    pub artifact: Account<'info, ArtifactAccount>,
    #[account(init, payer = admin, space = 8 + TransferApproval::SIZE, seeds = [b"approval", artifact.key().as_ref(), &artifact.epoch.to_le_bytes()], bump)]
    pub approval: Account<'info, TransferApproval>,
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
    pub from_owner: Pubkey,
    pub to_owner: Pubkey,
    pub epoch: u64,
    pub next_epoch: u64,
    pub capsule_hash: [u8; 32],
    pub expires_at: i64,
    pub consumed: bool,
}
impl TransferApproval { pub const SIZE: usize = 32 + 32 + 32 + 8 + 8 + 32 + 8 + 1; }

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
    #[msg("Overflow")]
    Overflow,
}
