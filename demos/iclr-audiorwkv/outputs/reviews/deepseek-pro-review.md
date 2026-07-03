# Peer Review: HARP — Hierarchical Autoregressive Representation Pyramid for Audio Understanding

## Summary

The paper proposes HARP, a conv-free pyramid-structured audio model combining (1) a multi-stage pyramid encoder that reduces spatial resolution via learned linear projections, (2) a multi-view decoder with frequency, temporal, and spectral cross-attention branches fused by learnable gates, and (3) autoregressive next-patch pretraining at multiple pyramid levels. The key claims are that HARP achieves sub-quadratic complexity without convolutional leakage, that AR pretraining yields strong transferable representations without decoder fine-tuning, and that these design choices jointly outperform prior work. HARP-Base (90M) reports 48.2 mAP on AudioSet-2M, 3.7× fewer FLOPs than AST-Base, and competitive-to-SOTA results on ESC-50, Speech Commands V2, NSynth Pitch, VGGSound, and AudioSet-20K.

## Strengths

1. **Well-motivated architecture combination.** The paper identifies a genuine gap — no prior work combines pyramid hierarchies, strictly causal AR pretraining, and conv-free token mixing for audio. Each design choice is individually justified (leakage problem in Mamba/RWKV, two-stage paradigm overhead, quadratic cost of full attention) and the synthesis is coherent.

2. **Conv-free causality is a real contribution.** Causal convolutions in Mamba/RWKV-style models leaking future information is a documented problem (Xiao et al., 2024; Sieber et al., 2024). HARP's design — only masked attention and linear projections — provides a clean architectural solution that the field should value.

3. **Strong empirical results.** HARP-B (90M, 14.5 GFLOPs) achieves 48.2 mAP on AudioSet-2M, substantially outperforming AST-B (35.2, 48.2 GFLOPs), BEATs (39.4, 44.8 GFLOPs), and Audio-Mamba-B (38.5, 12.8 GFLOPs). The 25M HARP-S exceeds or matches 86–92M baselines on multiple benchmarks. The scaling study from 6M to 90M shows monotonic gains without saturation.

4. **Thorough component ablation.** Table tab:ablation cleanly isolates the contribution of each component: AR pretraining (+8.1 mAP), pyramid hierarchy (+4.6 mAP over flat), multi-view decoder (+2.5 mAP), and each decoder view (frequency most important at 1.8). The stage-count sweep (2–5 stages) justifies the 4-stage default.

5. **Practical deployment story.** Eliminating decoder fine-tuning simplifies the pipeline — linear probe on mean-pooled features suffices. This matters for practical adoption.

## Weaknesses

1. **The appendix is empty.** The appendix (`06-appendix.tex`) contains only a placeholder. This is a significant omission for a submission that makes strong empirical claims. Missing: hyperparameter search methodology, full architecture details (per-stage layer counts, head counts, MLP ratios), training infrastructure and reproducibility information, standard deviations across random seeds, extended qualitative analysis, and additional ablations.

2. **No error bars or statistical significance.** All results tables report single-number metrics without confidence intervals, standard deviations, or any indication of variance across training runs. Differences as small as 0.3–0.4 mAP (e.g., 4 vs 5 stages, removing spectral view) are treated as meaningful without statistical validation. For a paper making comparative claims, this is a notable gap in rigor.

3. **"Partial causal mask" needs formal justification.** Section 3.2 states that tokens at the same time frame but different frequency bins attend to each other while cross-column attention is restricted to past time frames. This design choice warrants a formal justification: (a) is this truly causal for autoregressive prediction when frequency bins at time t can see each other? (b) what is the formal definition of M? (c) is there an ablation removing same-timestep frequency interaction? The paper claims "strict causality" repeatedly but this design departs from a standard causal autoregressive mask.

4. **Baseline comparison is incomplete.** Notable omissions: PaSST (efficient AST variant, directly relevant to efficiency claims), CLAP/LAION-CLAP (contrastive audio-language models that achieve strong linear-probe results), Whisper encoder features (widely used as strong audio representations), and ConvNeXt/vanilla CNN baselines at matched parameter counts. The paper primarily compares against four baselines, three of which are transformer-based and similarly aged.

5. **FLOPs-only efficiency analysis is insufficient.** FLOPs are the sole efficiency metric. Missing: measured wall-clock training time (not just "~48 GPU-hours" estimated), GPU memory consumption during training and inference, measured inference latency on actual hardware (not estimates), and throughput (samples/second). The FLOPs gap to Audio-Mamba-B (14.5 vs 12.8 GFLOPs) is small, so practical efficiency claims need hardware validation.

## Must-fix

1. **Populate the appendix and add reproducibility artifacts.** At minimum, include: full per-stage architecture hyperparameters (layers, heads, MLP ratio, patch sizes), training hyperparameter sweeps, data preprocessing pipeline, seed-based standard deviations for all main results, and any failed experiments or sensitivity analyses. The empty appendix in the current submission is unacceptable for a quantitative empirical paper.

2. **Add error bars or confidence intervals to all result tables.** Report mean ± std across at least 3 random seeds for the main results (Table tab:main), ablation table (Table tab:ablation), scaling table (Table tab:scaling), and flat-vs-pyramid comparison (Table tab:flat_ar). Without this, the 0.3–0.4 mAP differences claimed in ablations are not credible.

3. **Formally define the partial causal mask and justify its design.** Provide the exact mask matrix M definition. Explain why same-timestep frequency-bin interaction does not violate autoregressive causality, or qualify the "strictly causal" claim. Include an ablation removing same-timestep frequency interaction to show its empirical necessity.

4. **Add at minimum PaSST as a baseline.** PaSST is the most direct comparison point — an efficient AST variant that also reduces complexity through structured patching. Its omission undermines the FLOPs-efficiency claims.

5. **Provide measured (not estimated) hardware metrics.** Include wall-clock training time per epoch on the stated 8×A100 setup, peak GPU memory during training, and measured inference latency at multiple sequence lengths on a specific GPU. Estimates ("~48 GPU-hours," "<50 ms for 30 s") are insufficient for the paper's central efficiency argument.

## Nice-to-have

1. **Dense prediction results.** The pyramid design is naturally suited for multi-scale dense prediction (sound event detection with temporal localization, source separation). Even one dense task would significantly strengthen the architecture contribution beyond classification.

2. **Qualitative analysis of pyramid levels.** Visualize what different pyramid stages encode — e.g., t-SNE of stage features, attention map visualizations, or probe accuracy per stage. This would validate the multi-scale claim beyond quantitative ablations.

3. **Broader robustness study.** Evaluate under domain shift (different recording conditions, unseen sound classes), different spectrogram parameters, or noisy inputs. This tests whether AR pretraining yields genuinely robust representations.

4. **Comparison with hybrid objectives.** An AR+masked hybrid objective or a contrastive baseline at the same parameter count would contextualize the pure-AR design choice against the dominant masked autoencoding paradigm.

5. **Ablation on loss weights λ.** The weights [1.0, 0.8, 0.6, 0.4] appear chosen without justification. A sensitivity analysis or justification (e.g., based on stage resolution or token count) would strengthen the design.

## Score: 7/10

The paper proposes a well-motivated architecture with compelling benchmark results and genuinely useful design principles (conv-free causality, pyramid hierarchy, unified pretrain-to-downstream). The empirical results are strong and the ablation study is thorough in scope. However, the submission is undermined by an empty appendix, missing error bars, insufficient efficiency evidence (FLOPs-only), and incomplete baseline comparisons. These are fixable issues — the core contribution is sound — but they reduce confidence in the reported numbers and limit the paper's impact in its current form. With the must-fix items addressed, this would be a strong ICLR contribution.