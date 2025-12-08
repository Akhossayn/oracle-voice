
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TitanStatus {
  name: string;
  value: string;
  active: boolean;
}

export interface VoidState {
  price: number;
  void_elasticity: number;
  void_pressure: number;
  void_kinetic: number;
  domain_state: string;
  signal: string;
  monolith_stars: number;
  titans: TitanStatus[];
}

export class VoidEngine {
  public state: VoidState = {
    price: 0.0,
    void_elasticity: 0.0,
    void_pressure: 0.0,
    void_kinetic: 0.0,
    domain_state: "CALCULATING",
    signal: "STANDBY",
    monolith_stars: 0,
    titans: []
  };

  private trades: Array<{ p: number; q: number; b: boolean; t: number }> = [];
  private book_bids: Map<number, number> = new Map();
  private book_asks: Map<number, number> = new Map();
  private imbalance_hist: number[] = [];
  private ws: WebSocket | null = null;
  private symbol = "btcusdt";
  private onUpdate: ((state: VoidState) => void) | null = null;

  constructor(onUpdate?: (state: VoidState) => void) {
    this.onUpdate = onUpdate || null;
  }

  public connect() {
    if (this.ws) {
        this.ws.close();
    }

    const wsUrl = `wss://fstream.binance.com/stream?streams=${this.symbol}@aggTrade/${this.symbol}@depth20@100ms`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
        console.log(">>> MONOLITH LEDGER CONNECTED: " + this.symbol);
    };

    this.ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      const stream = payload.stream;
      const data = payload.data;

      if (stream.includes('aggTrade')) {
        this.processTrade(parseFloat(data.p), parseFloat(data.q), data.m);
      } else if (stream.includes('depth')) {
        this.processBook(data.b, data.a);
      }

      this.updateRegime();
      this.calculateMonolith();
      
      if (this.onUpdate) {
        this.onUpdate({...this.state});
      }
    };
  }

  private processTrade(p: number, q: number, is_buyer_maker: boolean) {
    const is_buyer = !is_buyer_maker;
    this.state.price = p;
    const t_now = Date.now() / 1000;
    
    this.trades.push({ p, q, b: is_buyer, t: t_now });
    if (this.trades.length > 1000) this.trades.shift();

    // CTD (Kinetic) - Net Flow 3s
    const recent = this.trades.filter(t => t.t > t_now - 3);
    const buy_vol = recent.filter(t => t.b).reduce((sum, t) => sum + t.q, 0);
    const sell_vol = recent.filter(t => !t.b).reduce((sum, t) => sum + t.q, 0);
    this.state.void_kinetic = buy_vol - sell_vol;

    // LQ (Elasticity) - Micro-Burst
    const micro = this.trades.slice(-15);
    if (micro.length > 1) {
      const micro_price_delta = micro[micro.length - 1].p - micro[0].p;
      const micro_vol = micro.reduce((sum, t) => sum + t.q, 0);
      if (micro_vol > 0.01) {
        this.state.void_elasticity = (micro_price_delta / micro_vol) * 10000;
      } else {
        this.state.void_elasticity = 0;
      }
    }
  }

  private processBook(bids: string[][], asks: string[][]) {
    bids.forEach(([p, q]) => {
      const qty = parseFloat(q);
      if (qty === 0) this.book_bids.delete(parseFloat(p));
      else this.book_bids.set(parseFloat(p), qty);
    });

    asks.forEach(([p, q]) => {
      const qty = parseFloat(q);
      if (qty === 0) this.book_asks.delete(parseFloat(p));
      else this.book_asks.set(parseFloat(p), qty);
    });

    if (this.book_bids.size === 0 || this.book_asks.size === 0) return;

    const best_bid = Math.max(...this.book_bids.keys());
    const best_ask = Math.min(...this.book_asks.keys());
    const l1_bid_vol = this.book_bids.get(best_bid) || 0;
    const l1_ask_vol = this.book_asks.get(best_ask) || 0;

    // OBI (Pressure)
    const denominator = l1_bid_vol + l1_ask_vol;
    const ratio = denominator > 0 ? (l1_bid_vol - l1_ask_vol) / denominator : 0;
    this.state.void_pressure = ratio;
    
    this.imbalance_hist.push(ratio);
    if (this.imbalance_hist.length > 120) this.imbalance_hist.shift();
  }

  private updateRegime() {
    if (this.imbalance_hist.length > 10) {
      const n = this.imbalance_hist.length;
      const mean = this.imbalance_hist.reduce((a, b) => a + b, 0) / n;
      const variance = this.imbalance_hist.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
      const volatility = Math.sqrt(variance);

      if (volatility < 0.1) this.state.domain_state = "STAGNANT";
      else if (volatility < 0.4) this.state.domain_state = "STABLE";
      else this.state.domain_state = "VOLATILE";
    }
  }

  private calculateMonolith() {
    const k = this.state.void_kinetic;   // CTD
    const p = this.state.void_pressure;  // OBI
    const e = this.state.void_elasticity;// LQ
    
    let stars = 0;
    
    const ctd_active = Math.abs(k) > 50.0;
    if (ctd_active) stars++;
    
    const obi_active = Math.abs(p) > 0.3;
    if (obi_active) stars++;
    
    const lq_active = Math.abs(e) > 2.0; 
    if (lq_active) stars++;

    // Regime Check
    const regime_active = this.state.domain_state === "VOLATILE";
    if (regime_active) stars++;

    this.state.monolith_stars = stars;

    // Signal Logic 
    if (k > 50.0 && e < 0.5) this.state.signal = "SHORT (TRAP)";
    else if (k > 50.0 && e > 2.0) this.state.signal = "LONG (BREAK)";
    else if (k < -50.0 && e > -0.5) this.state.signal = "LONG (TRAP)";
    else if (k < -50.0 && e < -2.0) this.state.signal = "SHORT (BREAK)";
    else this.state.signal = "OBSERVE";

    // Titans for UI
    this.state.titans = [
        { name: "CTD (Kinetic)", value: k.toFixed(1), active: ctd_active },
        { name: "OBI (Pressure)", value: p.toFixed(2), active: obi_active },
        { name: "LQ  (Elasticity)", value: e.toFixed(2), active: lq_active },
        { name: "BASIS", value: "---", active: false }, 
        { name: "WA", value: "---", active: false } 
    ];
  }
}
