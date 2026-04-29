use thiserror::Error;

#[derive(Error, Debug)]
pub enum FitCoreError {
    #[error("IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization: {0}")]
    Encode(String),
    #[error("deserialization: {0}")]
    Decode(String),
    #[error("invalid magic bytes")]
    InvalidMagic,
    #[error("invalid EOF marker")]
    InvalidEof,
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("verification failed")]
    VerificationFailed,
    #[error("{0}")]
    Other(String),
}

pub type FitResult<T> = Result<T, FitCoreError>;
