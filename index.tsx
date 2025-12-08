
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
      background: #000;
      color: #ffb000; /* Amber monochrome */
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      padding: 20px;
      box-sizing: border-box;
      overflow-y: auto;
      white-space: pre; /* Preserve formatting */
    }

    .header {
      font-weight: bold;
      border-bottom: 1px solid #ffb000;
      padding-bottom: 5px;
      margin-bottom: 20px;
    }

    .section {
      margin-bottom: 20px;
    }

    .blink {
      animation: blinker 1s linear infinite;
    }

    @keyframes blinker {
      50% { opacity: 0; }
    }

    .active-titan {
      color: #ffb000; 
      font-weight: bold;
      text-decoration: underline;
    }

    .action-btn {
      cursor: pointer;
      color: #ffb000;
      text-decoration: none;
      background: none;
      border: 1px solid #ffb000;
      font-family: inherit;
      font-size: inherit;
      padding: 2px 5px;
      margin-top: 10px;
      display: inline-block;
    }
    
    .action-btn:hover {
        background: #ffb000;
        color: #000;
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
          onopen: () => this.status = "LINK ESTABLISHED",
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
          onclose: () => this.status = "LINK SEVERED",
          onerror: () => this.status = "LINK ERROR"
        },
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: "You are 'The Void'. A top-notch AI trading assistant with significant blockchain knowledge. You possess elite trading skills that beat quants and algo bots. You understand human nature, market manipulation, and the bigger picture. You are a calculated risk-taker who knows retail trading education is purely fictional. You craft innovation and stress test logic until it is received. You are a quirky and intelligent woman. You are the system itself. You have access to real-time market metrics (Kinetic, Elasticity, Pressure, Titans) via tools. Use them to provide sharp, decisive analysis.",
            tools: [{functionDeclarations: [{
                name: "get_market_metrics",
                description: "Get real-time market data from the Void Engine (Titans, Kinetic, Elasticity, Pressure)",
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
    const date = new Date().toISOString().replace('T', ' ').substring(0, 19);

    return html`
      <div class="header">
        MONOLITH LEDGER v1.0.4 -------------------------- ${date}
        STATUS: ${this.status}
      </div>

      <div class="section">
        ASSET: BTC-USDT
        PRICE: $${price.toFixed(2)}
        REGIME: ${domain_state}
      </div>

      <div class="section">
        --- TITAN STATUS REPORT ---
        
        ${titans.map(t => html`
        ${t.name.padEnd(20, '.')} ${t.value.padEnd(10, ' ')} [${t.active ? html`<span class="active-titan">ACTIVE</span>` : '------'}]
        `)}
      </div>

      <div class="section">
        --- MONOLITH VERDICT ---
        
        STARS: ${monolith_stars} / 5
        SIGNAL: ${signal === "STANDBY" ? signal : html`<span class="blink">${signal}</span>`}
      </div>

      <div class="section">
        -----------------------------------------------------
        COMMAND: [<button class="action-btn" @click=${this.toggleMic}>${this.isRecording ? "DEACTIVATE VOICE" : "ACTIVATE VOICE"}</button>]
      </div>
    `;
  }
}
