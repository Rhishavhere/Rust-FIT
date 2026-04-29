use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DeltaType {
    Add,
    Update,
    Attest,
    Revoke,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AttesterType {
    Owner,
    CibilBureau,
    GstnPortal,
    IncomeTaxPortal,
    McaPortal,
    BankAA,
    ZerodhaKite,
    ManualCA,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FitDelta {
    pub delta_id: u32,
    pub timestamp: i64,
    pub layer_affected: u8,
    pub delta_type: DeltaType,
    pub summary: String,
    pub patch: Vec<u8>,
    pub attester: AttesterType,
    pub attester_pubkey: [u8; 32],
    #[serde(with = "serde_big_array::BigArray")]
    pub signature: [u8; 64],
}
