
/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session, Type} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import { VoidEngine, VoidState } from './void-engine';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = 'DISCONNECTED';
  @state() voidState: VoidState = {
    price: 0,
    void_elasticity: 0,
    void_kinetic: 0,
    void_pressure: 0,
    domain_state: "---",
    signal: "WAITING",
    monolith_stars: 0,
    titans: []
  };

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  private inputNode = this.inputAudioContext.createGain();
  private outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private voidEngine: VoidEngine;

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      background: #080808;
      color: #b0b0b0;
      font-family: 'Courier New', Courier, 'Lucida Sans Typewriter', 'Lucida Console', monospace;
      padding: 40px;
      box-sizing: border-box;
      overflow-y: auto;
      line-height: 1.4;
    }

    .ledger-container {
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #333;
      padding: 40px;
      background: #000;
      box-shadow: 10px 10px 0px #1a1a1a;
    }

    .title {
      font-size: 24px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 10px;
      text-align: center;
      border-bottom: 2px double #555;
      padding-bottom: 10px;
    }

    .meta-info {
      font-size: 12px;
      text-align: right;
      color: #666;
      margin-bottom: 30px;
    }

    .section-header {
      font-size: 16px;
      font-weight: bold;
      margin-top: 30px;
      margin-bottom: 10px;
      text-transform: uppercase;
      border-bottom: 1px dashed #444;
      display: inline-block;
      width: 100%;
    }

    .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-size: 14px;
    }

    .label {
      color: #888;
    }

    .value {
      font-weight: bold;
      color: #ddd;
    }

    .separator {
      margin: 20px 0;
      color: #333;
      text-align: center;
      font-size: 10px;
    }

    .monolith-box {
      border: 1px solid #ddd;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
      background: #0a0a0a;
    }

    .stars {
      font-size: 32px;
      letter-spacing: 10px;
      margin: 10px 0;
    }

    .verdict {
      font-size: 20px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .regime-display {
      text-align: center;
      font-size: 18px;
      margin: 20px 0;
      padding: 10px;
      border-top: 1px solid #333;
      border-bottom: 1px solid #333;
    }

    .active-indicator {
      color: #fff;
      text-shadow: 0 0 5px #fff;
    }

    .controls {
      margin-top: 40px;
      text-align: center;
      border-top: 1px dotted #333;
      padding-top: 20px;
    }

    button {
      background: transparent;
      color: #888;
      border: 1px solid #333;
      padding: 5px 15px;
      font-family: inherit;
      cursor: pointer;
      font-size: 12px;
      text-transform: uppercase;
    }
    button:hover {
      border-color: #888;
      color: #ddd;
    }
    button.active {
      background: #222;
      color: #fff;
      border-color: #fff;
    }
  `;

  constructor() {
    super();
    this.voidEngine = new VoidEngine((newState) => {
        this.voidState = {...newState};
    });
    this.initClient();
  }

  firstUpdated() {
      this.voidEngine.connect();
  }

  private async initClient() {
    this.outputNode.connect(this.outputAudioContext.destination);
    this.client = new GoogleGenAI({apiKey: process.env.API_KEY});
    await this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';
    try {
      this.session = await this.client.live.connect({
        model,
        callbacks: {
          onopen: () => this.status = "CONNECTED",
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.toolCall) {
                const responses = msg.toolCall.functionCalls.map(fc => ({
                    id: fc.id, name: fc.name, response: { result: JSON.stringify(this.voidState) }
                }));
                this.session.sendToolResponse({ functionResponses: responses });
            }
            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData) {
                this.playAudio(msg.serverContent.modelTurn.parts[0].inlineData.data);
            }
          },
          onclose: () => this.status = "OFFLINE",
          onerror: () => this.status = "ERROR"
        },
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: "You are the Voice of the Monolith. Ancient, mechanical, absolute. You do not chat. You confirm Titans. You announce Regimes. Speak briefly.",
            tools: [{functionDeclarations: [{
                name: "get_market_metrics",
                description: "Read the Ledger",
                parameters: { type: Type.OBJECT, properties: {} }
            }]}]
        }
      });
    } catch(e) { console.error(e); }
  }

  private async playAudio(data: string) {
    this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
    const audioBuffer = await decodeAudioData(decode(data), this.outputAudioContext, 24000, 1);
    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  private async toggleMic() {
    if(this.isRecording) {
        this.isRecording = false;
        this.scriptProcessorNode?.disconnect();
        this.sourceNode?.disconnect();
        return;
    }
    this.isRecording = true;
    this.inputAudioContext.resume();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
    this.sourceNode = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
    this.scriptProcessorNode.onaudioprocess = (e) => {
        if(!this.isRecording) return;
        this.session.sendRealtimeInput({media: createBlob(e.inputBuffer.getChannelData(0))});
    };
    this.sourceNode.connect(this.scriptProcessorNode);
    this.scriptProcessorNode.connect(this.inputAudioContext.destination);
  }

  render() {
    const { price, domain_state, signal, monolith_stars, titans } = this.voidState;
    const filledStars = "★".repeat(monolith_stars);
    const emptyStars = "☆".repeat(5 - monolith_stars);
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();

    return html`
      <div class="ledger-container">
        <div class="title">THE LEDGER</div>
        <div class="meta-info">
            DATE: ${date}<br>
            TIME: ${time}<br>
            LINK: ${this.status}
        </div>

        <div class="separator">========================================</div>

        <div class="monolith-box">
            <div>MONOLITH STATUS</div>
            <div class="stars">${filledStars}${emptyStars}</div>
            <div class="verdict">${signal}</div>
        </div>

        <div class="regime-display">
            CURRENT REGIME: <span style="font-weight:bold">${domain_state}</span>
        </div>

        <div class="section-header">ACTIVE TITANS</div>
        
        ${titans.map(t => html`
            <div class="row">
                <span class="label">${t.name} ........................</span>
                <span class="value ${t.active ? 'active-indicator' : ''}">
                    ${t.value} ${t.active ? '[ACTIVE]' : ''}
                </span>
            </div>
        `)}

        <div class="separator">========================================</div>

        <div class="row">
            <span class="label">ASSET PRICE</span>
            <span class="value">$${price.toFixed(2)}</span>
        </div>

        <div class="controls">
            <button class="${this.isRecording ? 'active' : ''}" @click=${this.toggleMic}>
                ${this.isRecording ? "VOICE LINK ACTIVE" : "ACTIVATE VOICE LINK"}
            </button>
        </div>
      </div>
    `;
  }
}
