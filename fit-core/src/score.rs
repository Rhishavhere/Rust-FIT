use serde_json::Value;

/// Holistic FIT score 0–1000 (Product §3 weighting).
pub fn compute_fit_score(layers: &[Value]) -> u16 {
    if layers.len() < 6 {
        return 0;
    }
    let credit = subscore_credit(layers.get(1));
    let assets = subscore_assets(layers.get(2));
    let income = subscore_income(layers.get(3));
    let behavior = subscore_behavior(layers.get(4));
    let attest = subscore_attest(layers.get(5));
    let total = 0.30 * credit
        + 0.25 * assets
        + 0.20 * income
        + 0.15 * behavior
        + 0.10 * attest;
    let rounded = total.round() as u32;
    rounded.min(1000) as u16
}

fn norm_cibil(v: f64) -> f64 {
    let n = ((v - 300.0) / 600.0).clamp(0.0, 1.0) * 1000.0;
    n
}

fn subscore_credit(v: Option<&Value>) -> f64 {
    let v = match v {
        Some(x) => x,
        None => return 500.0,
    };
    let cibil = v
        .get("cibil_score")
        .and_then(|x| x.as_f64())
        .unwrap_or(650.0);
    let util = v
        .get("overall_credit_utilization_pct")
        .and_then(|x| x.as_f64())
        .unwrap_or(40.0);
    let util_penalty = (util / 100.0) * 200.0;
    (norm_cibil(cibil) - util_penalty).clamp(0.0, 1000.0)
}

fn subscore_assets(v: Option<&Value>) -> f64 {
    let v = match v {
        Some(x) => x,
        None => return 500.0,
    };
    let nw = v
        .get("net_worth")
        .and_then(|x| x.as_f64())
        .unwrap_or(0.0);
    // Log-like scale: 0 -> 0, 1Cr -> ~600, 5Cr+ -> ~1000
    let n = (nw / 5_000_000.0).ln_1p() * 400.0 + 200.0;
    n.clamp(0.0, 1000.0)
}

fn subscore_income(v: Option<&Value>) -> f64 {
    let v = match v {
        Some(x) => x,
        None => return 500.0,
    };
    let itr = v.get("itr").and_then(|a| a.as_array());
    let mut trend = 0.5;
    if let Some(rows) = itr {
        if rows.len() >= 2 {
            let last = rows.last().and_then(|r| r.get("income")).and_then(|x| x.as_f64());
            let first = rows.first().and_then(|r| r.get("income")).and_then(|x| x.as_f64());
            if let (Some(l), Some(f)) = (last, first) {
                if f > 0.0 {
                    trend = ((l - f) / f).clamp(-0.5, 0.5) + 0.5;
                }
            }
        }
    }
    let gst_ok = v
        .get("business")
        .and_then(|b| b.get("gst_status"))
        .and_then(|s| s.as_str())
        .map(|s| s.eq_ignore_ascii_case("active"))
        .unwrap_or(false);
    let gst_bonus = if gst_ok { 80.0 } else { 0.0 };
    (trend * 800.0 + gst_bonus).min(1000.0)
}

fn subscore_behavior(v: Option<&Value>) -> f64 {
    let v = match v {
        Some(x) => x,
        None => return 500.0,
    };
    let inv = v.get("investment_count").and_then(|x| x.as_f64()).unwrap_or(0.0);
    let churn = v
        .get("portfolio_churn_rate_pct")
        .and_then(|x| x.as_f64())
        .unwrap_or(20.0);
    let inv_score = (inv * 80.0).min(500.0);
    let churn_penalty = (churn / 100.0) * 200.0;
    (400.0 + inv_score - churn_penalty).clamp(0.0, 1000.0)
}

fn subscore_attest(v: Option<&Value>) -> f64 {
    let v = match v {
        Some(x) => x,
        None => return 400.0,
    };
    let at = v.get("attestations").and_then(|a| a.as_array());
    let count = at.map(|a| a.len()).unwrap_or(0) as f64;
    (count * 120.0 + 200.0).min(1000.0)
}
