Purpose: Independent peer review of ICLR 2026 submission on HARP audio understanding

# Review: HARP - Hierarchical Autoregressive Representation Pyramid for Audio Understanding

## Summary

This paper introduces HARP (Hierarchical Autoregressive Representation Pyramid), a novel audio representation model that combines three key innovations: (1) a pyramid-structured encoder using linear patch-merging for sub-quadratic complexity, (2) a multi-view decoder with frequency, temporal, and spectral cross-attention branches and gated fusion, and (3) autoregressive next-patch pretraining at multiple pyramid levels without convolution-based token mixing. HARP-Base (90M parameters) achieves 48.2 mAP on AudioSet-2M (from scratch) and 51.4 mAP (pretrained), outperforming AST, AudioMAE, BEATs, and Audio-Mamba while using 3.7× fewer FLOPs than AST-Base.

---

## Strengths

1. **Strong empirical performance**: HARP achieves SOTA results across all five benchmarks (AudioSet-2M, VGGSound, ESC-50, Speech Commands V2, NSynth Pitch, AudioSet-20K). The 48.2 mAP on AudioSet-2M represents a significant +8.3 improvement over the best prior from-scratch result (BEATs at 39.4).

2. **Efficiency-accuracy trade-off**: The paper convincingly demonstrates a favorable efficiency frontier—HARP-B uses only 14.5 GFLOPs versus 48.2 GFLOPs for AST-Base (3.3× reduction) while exceeding its accuracy. The efficiency plot (Fig. 3) clearly shows the linear vs. quadratic scaling difference.

3. **Rigorous ablation studies**: The paper systematically ablates each component—AR pretraining (-8.1 mAP), multi-view decoder (-2.5 mAP), pyramid structure (-4.6 mAP)—providing clear evidence for the contribution of each design choice.

4. **Novel architectural combination**: While pyramid hierarchies exist in vision (Swin, PVT) and Mamba/SSMs exist for audio, this is the first work combining autoregressive pretraining with a pyramid structure for audio, and importantly, it avoids convolutional token mixing entirely.

5. **Clean pretrain-downstream pipeline**: The unified architecture (discarding decoder for downstream) is elegant and avoids the two-stage paradigm common in masked audio encoders.

---

## Weaknesses

1. **Limited novelty beyond combination**: HARP primarily combines well-established components (pyramid encoder from vision, cross-attention decoder, AR pretraining) rather than introducing fundamentally new mechanisms. The multi-view decoder is architecturally interesting but builds on standard cross-attention patterns.

2. **Missing comparison with concurrent work**: The paper compares against Audio-Mamba (2024) but does not discuss other recent efficient audio transformers or pyramid audio models that may have appeared in 2024-2025.

3. **Training compute not clearly reported**: While inference FLOPs are well-documented, training time/hours are only mentioned briefly ("~48 GPU-hours vs ~120") without details on the total compute budget, making reproducibility challenging.

4. **Evaluation limited to classification**: The paper acknowledges this limitation—dense prediction tasks (sound event detection, source separation) are not evaluated. This leaves open whether the learned representations generalize beyond classification.

5. **Spectrogram-only input**: The method uses fixed log-Mel spectrograms (64 bins, 25ms window). No exploration of learnable waveform front-ends or alternative time-frequency representations.

6. **Ablation on pretraining data**: The paper uses AudioSet-2M + VGGSound (~2.2M clips) but does not ablate the effect of pretraining data scale on downstream performance.

---

## Must-fix (Required for Acceptance)

1. **Provide training compute details**: Report total GPU-hours, number of GPUs, and training time for each model variant (T/S/B) to enable reproducibility and fair compute comparison.

2. **Add AudioSet-2M pretrained results for all baselines**: Table 2 shows pretrained results only for HARP-B. For fair comparison, report pretrained results for all baseline models (AST, AudioMAE, BEATs, Audio-Mamba) on at least AudioSet-2M, or clearly state if these are unavailable.

3. **Clarify causal masking implementation**: The partial causal mask description ("tokens at the same time frame but different frequency bins attend to each other; cross-column attention restricted to past time frames") is ambiguous. Provide a more precise mathematical definition or diagram.

4. **Include statistical significance**: Report confidence intervals or standard deviations across seeds for at least the main AudioSet-2M results to demonstrate robustness.

5. **Address the "from-scratch" vs "pretrained" distinction more carefully**: The paper shows HARP from-scratch outperforms baseline pretrained models, which is a strong claim. Ensure fair comparison (same data, same evaluation protocol, same linear probe setup).

---

## Nice-to-have (Would Strengthen the Paper)

1. **Visualization of learned features**: Show t-SNE or attention visualizations to provide intuition about what the pyramid levels learn.

2. **Longer audio evaluation**: Test on audio longer than 10 seconds to validate the efficiency claims at scale (the paper mentions 30s but doesn't show results).

3. **Source code or model release**: ICLR typically values reproducibility; even a detailed pseudocode for the pyramid encoder would help.

4. **Error analysis**: Show qualitative examples where HARP fails or succeeds to provide insight into the learned representations.

5. **Comparison with state-space models (Mamba) at matched compute**: The current comparison shows HARP-B (90M, 14.5G) vs Audio-Mamba-B (92M, 12.8G). A more informative comparison would match FLOPs rather than parameters.

---

## Score: 7 / 10

**Justification**: This is a solid submission that makes a credible contribution to efficient audio understanding. The empirical results are strong, the efficiency gains are real, and the paper is well-written. The main concerns are the incremental nature of the technical contribution (combining existing ideas rather than introducing fundamentally new mechanisms) and some missing details for reproducibility. With the must-fix items addressed, this would be a strong accept. The paper would benefit from deeper analysis of *why* the pyramid helps (what do different stages capture?) and more extensive evaluation on diverse audio tasks.

Creating: reviews\kiro-minimax-review.md

Done. Written the review to reviews/kiro-minimax-review.md.

Summary of review:
- **Score: 7/10**
- **Key strengths**: Strong empirical results (48.2 mAP on AudioSet-2M), excellent efficiency (3.3× fewer FLOPs than AST), rigorous ablations, novel architectural combination
- **Main weaknesses**: Incremental novelty (combining existing techniques), missing training compute details, evaluation limited to classification
- **5 must-fix items**: Training compute details, baseline pretrained results, causal mask clarification, statistical significance, fair from-scratch comparison