Now I'll write the peer review to the required path:

# Independent Peer Review: HARP (KIRO CLI / qwen3-coder-next)

**Paper:** HARP: Hierarchical Autoregressive Representation Pyramid for Audio Understanding  
**Venue:** ICLR 2026  
**Review Type:** Fresh isolated review (no prior reviewer context)

---

## Summary

HARP (Hierarchical Autoregressive Representation Pyramid) proposes a novel architecture for audio understanding that combines pyramid-structured encoding with strict causal autoregressive pretraining. The paper addresses key limitations in existing approaches: (1) quadratic complexity of self-attention in audio Transformers, (2) information leakage from causal convolutions in linear-complexity alternatives like Mamba/RWKV, and (3) complexity of two-stage encoder-decoder pretraining pipelines. The solution is a conv-free architecture with learned linear patch-merging projections, a multi-view decoder with frequency/temporal/spectral cross-attention branches, and autoregressive next-patch prediction at multiple pyramid levels. Results show HARP-Base (90M) achieves 48.2 mAP on AudioSet-2M while using 3.7× fewer FLOPs than AST-Base.

---

## Strengths

1. **Novelty of Combined Approach:** The paper successfully unifies three previously underexplored concepts for audio: pyramid-structured multi-scale encoding, strictly causal autoregressive pretraining without convolutions, and unified pretrain-to-downstream architecture without decoder fine-tuning. This combination represents the first of its kind for audio.

2. **Strong Empirical Performance:** HARP-Base achieves state-of-the-art results across multiple benchmarks (ESC-50: 88.2%, Speech Commands V2: 96.1%, NSynth Pitch: 94.5%) while maintaining computational efficiency. The 48.2 mAP on AudioSet-2M exceeds prior models including BEATs, AudioMAE, and Audio-Mamba.

3. **Rigorous Ablation Studies:** The paper provides comprehensive ablation studies isolating key design choices: removal of AR pretraining (−8.1 mAP), single-view decoder (−2.5 mAP), and flat vs. pyramid architecture (−4.6 mAP). These clearly demonstrate the contribution of each component.

4. **Efficiency Claims Backed by Data:** The linear complexity advantage is demonstrated through FLOP counts (14.5 GFLOPs for HARP-B vs. 48.2 GFLOPs for AST-B at 30s audio) and wall-clock inference times (<50ms vs. >200ms).

5. **Clear Technical Presentation:** The methodology section is well-structured, with precise mathematical formulations of the pyramid encoder, multi-view decoder, and autoregressive objective.

---

## Weaknesses

1. **Comparison to RWKV is Incomplete/Inaccurate:** The paper claims "RWKV relies on convolutions that leak future information" and cites Sieber et al. 2024. However, standard RWKV does *not* use convolutions—it uses state-space updates with token-mixing MLPs. The cited paper may discuss a specific variant or a theoretical concern, but this characterization misrepresents RWKV's core design. This undermines the paper's positioning of its contribution relative to RWKV.

2. **"Conv-Free" Claim Requires Qualification:** While HARP avoids convolutions in the token-mixing layers (using attention and linear projections), the positional encoding uses learned 2D encodings. If the spectrogram input processing involves any spectral filtering or feature extraction, the claim "conv-free" could be misleading. A more precise phrasing would be "convolution-free token mixing."

3. **Multi-View Decoder Complexity:** The multi-view decoder with three parallel cross-attention branches adds substantial complexity without clear justification for why all three views are necessary. The ablation shows the spectral view contributes minimally (−1.1 mAP removal), suggesting potential redundancy.

4. **Limited Downstream Evaluation Scope:** The evaluation focuses exclusively on clip-level classification. Tasks requiring dense predictions (sound event detection, source separation, speech synthesis) are mentioned only as future work, leaving open whether the pyramid structure and causal pretraining generalize to these settings.

5. **No Ablation on Causal Masking Strategy:** The partial causal mask (allowing full frequency interaction per time step) is a key design choice, but the paper provides no ablation on this decision versus full causal masking or alternative masking strategies.

6. **Pretraining Data Details Omitted:** The appendix appears to be a placeholder, suggesting important implementation details (exact preprocessing, hyperparameter tuning, hardware configuration) may not be fully reproducible from the paper alone.

---

## Must-Fix

1. **Correct RWKV characterization:** The claim that "RWKV relies on convolutions" is factually incorrect for the standard RWKV architecture. RWKV uses state-space updates with MLP-based token mixing, not convolutions. The paper should either (a) cite a specific convolutional variant of RWKV if that is the comparison point, or (b) revise the claim to accurately describe what about RWKV-style architectures violates strict causality according to Sieber et al.

2. **Clarify "conv-free" terminology:** Add a footnote or clarification that the convolution-free claim applies specifically to token-mixing operations (using linear projections and attention), not to potential preprocessing stages.

3. **Justify multi-view decoder redundancy:** Either remove the spectral view if it contributes minimally, or provide a principled justification for its inclusion (e.g., empirical necessity despite small marginal gain, or theoretical alignment with audio structure).

---

## Nice-to-Have

1. **Ablation on causal masking strategy:** Compare partial causal mask vs. full causal mask vs. bidirectional attention on a subset of benchmarks.

2. **Direct comparison to RWKV on identical setup:** Since RWKV is mentioned as a baseline approach, a head-to-head comparison on the same AudioSet pretraining and downstream benchmarks would strengthen the empirical claims.

3. **Additional dense prediction tasks:** Even a small set of experiments on sound event detection or speech synthesis would significantly increase the paper's impact and demonstrate generalizability.

4. **Analysis of pyramid stage importance:** Visualize or quantify what each pyramid level learns (e.g., frequency resolution vs. temporal context) to better understand the multi-scale representations.

5. **Discussion of computational tradeoffs in training vs. inference:** The paper mentions training time (~48 GPU-hours for HARP-B) but doesn't compare optimization efficiency or memory usage, which are critical for scaling.

---

## Score: 8/10

**Rationale:** HARP presents a novel and well-executed architecture that successfully addresses important limitations in audio representation learning. The empirical results are strong and supported by thorough ablation studies. The paper is technically sound and clearly written. However, the mischaracterization of RWKV as convolutional is a significant technical error that undermines the paper's framing, and the multi-view decoder's redundancy is not fully justified. These issues are correctable through revision but impact the paper's current quality assessment. With the required fixes (particularly the RWKV correction), this would be a strong acceptance.

---

*Review performed by: KIRO CLI (qwen3-coder-next model)*  
*Session: Fresh isolated peer review — file handoff only*  
*Date: 2026-07-03*

Creating: reviews\kiro-qwen-review.md

Review complete. Written reviews/kiro-qwen-review.md with:

- **Summary**: HARP's pyramid + causal AR pretraining contribution
- **Strengths**: Novelty, empirical performance, ablations, efficiency, clarity
- **Weaknesses**: RWKV mischaracterization, conv-free claim, decoder redundancy, limited evaluation scope
- **Must-fix**: 3 items (correct RWKV claim, clarify terminology, justify spectral view)
- **Nice-to-have**: 5 optional improvements
- **Score**: 8/10

No other files read or written outside the specified paths.