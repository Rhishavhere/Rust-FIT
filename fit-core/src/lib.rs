#![forbid(unsafe_code)]

pub mod crypto;
pub mod delta;
pub mod delta_ops;
pub mod error;
pub mod format;
pub mod genesis;
pub mod merkle;
pub mod personas;
pub mod score;
pub mod share;

pub use crate::delta_ops::apply_json_patch_delta;
pub use crate::format::{
    parse_fit, serialize_fit, ParsedFitBlob, ParsedFitFile,
};
pub use crate::genesis::{
    genesis_from_persona, materialize_fit, materialize_fit_to_map, verify_signature,
};
pub use crate::share::{
    create_share_envelope, open_share_envelope, parse_share_envelope, FitShareEnvelope,
};
