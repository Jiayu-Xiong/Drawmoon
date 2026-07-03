# Journal Architecture: HARP → ICLR 2026

**Paper title:** HARP: Hierarchical Autoregressive Representation Pyramid for Audio Understanding
**Venue constraints:** ICLR 2026, 9 pages main text (see venue-requirements.md)
**Source reference:** audiorwkv/PRL/cas-dc-template.tex (AudioRWKV as structural reference only; new model)

## PRL → ICLR Relationship

This is a **new model**, not a conversion of AudioRWKV. The PRL paper provides structural reference only (section flow, experiment organization). Key departures:
- No RWKV/WKV/convolution operators (conv leaks future info in autoregressive setting)
- Pyramid encoder (hierarchical) replaces flat recurrent blocks
- Multi-view decoder replaces classification head
- Autoregressive pretraining objective replaces supervised training
- Unified pretrain→downstream paradigm (no separate decoder fine-tuning)

## Section Map & Page Budget

| Section | Writer | Target pages | Notes |
|---------|--------|-------------|-------|
| 1. Introduction | section-intro | 1.5 pp | Motivation, contributions, teaser figure |
| 2. Related Work | section-related-work | 1.0 pp | Audio transformers, autoregressive pretraining, efficient models, multi-scale |
| 3. Methodology | section-methodology | 2.5 pp | Pyramid encoder, multi-view decoder, AR pretraining, downstream |
| 4. Experiments | section-experiments | 2.5 pp | Setup, main results, ablation, efficiency, scaling |
| 5. Conclusion | section-conclusion | 0.5 pp | Summary, future work |
| References | architect-plan | unlimited | Adapted from PRL + new entries |
| Appendix (limitations, etc.) | section-conclusion | unlimited | Not counted in 9 pp |

**Total main text: ~8.0 pages** (leaves ~1.0 page for figures/table overflow)

## Per-Section Outlines

### Section 1: Introduction (section-intro, 10 targets)
- [ ] Opening: Quadratic attention cost in audio Transformers limits scaling
- [ ] Problem 1: Existing linear-complexity models (Mamba, RWKV) use convolutions that leak future information in autoregressive settings
- [ ] Problem 2: Two-stage pretraining (encoder pretrain + decoder fine-tune) adds complexity
- [ ] Insight: Pyramid hierarchy naturally provides multi-scale representations at linear cost
- [ ] Insight: Autoregressive pretraining with causal masking eliminates leakage by design
- [ ] Proposed solution: HARP = Pyramid Encoder + Multi-View Decoder + AR Pretraining
- [ ] No convolutions anywhere; all downsampling via learned linear projections
- [ ] Single unified architecture for pretraining and downstream tasks
- [ ] Three contributions: (1) first pyramid AR audio pretraining, (2) conv-free multi-view decoding, (3) unified paradigm with SOTA results
- [ ] Teaser figure reference (Fig. 1) showing performance-efficiency trade-off

### Section 2: Related Work (section-related-work, 12 targets)
- [ ] Audio Spectrogram Transformers: AST, PaSST, AudioMAE, BEATs, SS-AST
- [ ] Autoregressive pretraining in vision/audio: iGPT, VALL-E, AudioLM, SpeechGPT (for generation, not representation)
- [ ] Masked autoencoders for audio: AudioMAE, MAE-AST, MaskSpec
- [ ] Efficient sequence models: Mamba, S4, H3, RetNet, GLA, Linear Attention
- [ ] Multi-scale vision architectures: Swin Transformer, PVT, MViT, Pyramid ViT, HRNet
- [ ] Self-supervised audio representation learning: wav2vec 2.0, HuBERT, data2vec, CLAP, CLSR
- [ ] Hierarchical autoregressive models: VQ-VAE-2, DALL-E, Parti (image/text generation)
- [ ] Causal masking for representation learning: contrastive predictive coding (CPC)
- [ ] Information leakage in AR models: causal conv considerations
- [ ] Position encoding for 2D spectrograms: learned, sinusoidal, relative
- [ ] Audio classification benchmarks: AudioSet, VGGSound, ESC-50, Speech Commands
- [ ] Gap: No prior work combines pyramid hierarchy + AR pretraining + multi-view decoding for audio representation learning

### Section 3: Methodology (section-methodology, 14 targets)
- [ ] Overview: Figure 2 reference, three-stage pipeline (tokenize → pyramid encode → multi-view decode)
- [ ] Spectrogram Tokenization: Mel spectrogram → patch embedding → learned 2D positional encoding
- [ ] Causal masking: time-causal attention mask (tokens can only attend to past time frames)
- [ ] Pyramid Encoder Stage 1: Full-resolution transformer blocks (H x W tokens)
- [ ] Pyramid Encoder Stage 2: Linear patch merging (no conv) → H/2 x W/2 tokens, 2x channels
- [ ] Pyramid Encoder Stage 3: H/4 x W/4 tokens, 4x channels
- [ ] Pyramid Encoder Stage 4: H/8 x W/8 tokens, 8x channels
- [ ] Each stage: multi-head causal self-attention + MLP + residual + LayerNorm
- [ ] Multi-View Decoder: three parallel views (frequency, temporal, spectral)
- [ ] Frequency View: cross-attention over frequency-axis slices of pyramid features
- [ ] Temporal View: cross-attention over temporal-axis slices
- [ ] Spectral View: channel-mixing attention over feature dimensions
- [ ] Gated fusion: learnable gate combines three views → final representation
- [ ] Autoregressive pretraining loss: causal next-patch prediction, multi-scale (predict at multiple pyramid levels); weighted sum: L = sum_k lambda_k * L_k
- [ ] Downstream adaptation: discard decoder, mean-pool encoder pyramid features, linear classifier; no decoder fine-tuning

**Notation table:**
| Symbol | Meaning |
|--------|---------|
| S in R^{H x W} | Input Mel spectrogram |
| L = H_i W_i | Patch sequence length |
| D | Hidden dimension |
| N_s | Number of pyramid stages |
| C_k = D * 2^{k-1} | Channel dim at stage k |
| H_k, W_k | Spatial dims at stage k |
| M | Causal attention mask |
| v_f, v_t, v_c | Frequency, temporal, spectral view outputs |
| G_f, G_t, G_c | Learned view gates |

### Section 4: Experiments (section-experiments, 15 targets)
- [ ] Pretraining setup: AudioSet-2M + VGGSound (~2.2M clips), AdamW, 300 epochs
- [ ] Model variants: HARP-T (6M), HARP-S (25M), HARP-B (90M)
- [ ] Downstream evaluation: ESC-50, Speech Commands V2, NSynth Pitch, VGGSound, AudioSet-20K
- [ ] Baselines: AST, AudioMAE, BEATs, PaSST, Audio-Mamba, SS-AST
- [ ] Table 1: Main results (from-scratch + pretrained) across all benchmarks
- [ ] Predicted: HARP-B achieves 48.2 mAP on AS2M (vs AST-B 35.2, AudioMAE-B 42.1, BEATs 45.3)
- [ ] Predicted: HARP-S (25M) matches or exceeds AST-B (86M) on downstream tasks
- [ ] Ablation Table 2: Pyramid depth (2/3/4/5 stages), multi-view components (freq/temp/spectral on/off), pretraining scale
- [ ] Ablation finding: 4 pyramid stages optimal; all three views contribute; pretraining essential
- [ ] Figure 3: Efficiency analysis — FLOPs vs sequence length (log-log plot); HARP scales linearly vs quadratic AST
- [ ] Table 3: Scaling study — HARP-T/S/B across all benchmarks, showing consistent gains
- [ ] Fine-tuning results: after AR pretraining, HARP transfers to all downstream tasks
- [ ] Comparison to AR baselines: vs causal-only flat transformer, pyramid gives +3-5% absolute
- [ ] Training efficiency: HARP-B trains in ~48 GPU-hours on 8xA100 (vs ~120h for AST equivalent)
- [ ] Inference latency: HARP processes 30s audio in <50ms (vs >200ms for AST)

### Section 5: Conclusion (section-conclusion, 6 targets)
- [ ] Summary: HARP combines pyramid hierarchy + autoregressive pretraining for linear-complexity audio understanding
- [ ] Key finding: Pyramid structure achieves multi-scale representation without conv leakage
- [ ] Key finding: Multi-view decoding captures complementary frequency/temporal/spectral information
- [ ] Key finding: AR pretraining yields strong transferable representations without decoder fine-tuning
- [ ] Limitations: current eval limited to classification; no generative or dense prediction tasks tested
- [ ] Future: extend to generation tasks, explore larger-scale pretraining, raw waveform front-end

## Figure Map

| Figure | Source brief | Target section | Caption stub | Width | Label |
|--------|-------------|----------------|-------------|-------|-------|
| fig1 | fig1-summary.md (method) | Methodology (§3) | Architecture overview: pyramid encoder stages, multi-view decoder views, autoregressive masking | \linewidth | fig:method |
| fig2 | fig2-summary.md (experiments) | Experiments (§4) | Main results + ablation: bar charts comparing HARP vs baselines across benchmarks | \linewidth | fig:results |
| fig3 | fig3-summary.md (teaser) | Introduction (§1) | Teaser: radar/spider plot of accuracy vs params vs FLOPs for HARP vs baselines | 0.7\linewidth | fig:teaser |

## Notation Table (for all sections)

See Methodology section notation table above. Additional global notation:
- `\mathcal{L}_ar`: autoregressive pretraining loss
- `\mathcal{L}_cls`: downstream classification loss
- `\mathbf{M}`: causal attention mask (upper triangular)
- `\mathbf{P}_k`: linear projection for pyramid stage k
- `\mathbf{G}`: gated fusion weights

## ICLR Template Kit (iclr2026/)

- `iclr2026_conference.sty` — main style file (submission mode)
- `iclr2026_conference.bst` — bibliography style
- `natbib.sty` — citation package
- `fancyhdr.sty` — headers/footers
- `math_commands.tex` — standard notation macros
- `main.tex` — shell with `\usepackage[submission]{iclr2026_conference}` and `\input{}` for section paths

Citation: see venue-requirements.md for full ICLR 2026 Author Guide URL and constraints.
