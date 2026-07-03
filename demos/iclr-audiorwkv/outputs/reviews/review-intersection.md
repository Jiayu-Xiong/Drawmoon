## Consensus must-fix

1. **Clarify causal masking implementation and provide formal definition** — Three reviews request a formal mathematical definition of the partial causal mask matrix M (kiro-deepseek review, kiro-minimax review, deepseek-pro review). The current description of same-timestep frequency-bin interaction is ambiguous, and the "strictly causal" claim needs justification.

2. **Add statistical significance / error bars to all result tables** — Three reviews call for confidence intervals, standard deviations across random seeds, or statistical significance testing (kiro-deepseek review, kiro-minimax review, deepseek-pro review). Single-number metrics make small differences (0.3–0.4 mAP) in ablations unverifiable.

3. **Report measured training compute and hardware metrics** — Two reviews request actual measured training/hardware details rather than estimates (kiro-minimax review, deepseek-pro review). At minimum: GPU-hours, wall-clock training time per epoch, GPU memory consumption, and measured inference latency on specific hardware.

## Consensus themes (optional)

- **Incomplete baseline comparisons** — Multiple reviews note missing baselines (PaSST, conv-based models at matched compute, leakage-ablation vs. Audio-Mamba) that weaken the efficiency and causality claims.
- **Evaluation scope limited to classification** — All four reviews note the lack of dense prediction tasks (sound event detection, source separation), leaving generalizability unvalidated.

## Dropped (single-reviewer only)

- Improve baselines comparison with leakage-specific ablation vs. causal convolutions (kiro-deepseek review)
- Expand related work positioning vs. AudioMAE and Audio-Mamba (kiro-deepseek review)
- Visualize learned representations with t-SNE / attention maps (kiro-deepseek review)
- Add AudioSet-2M pretrained results for all baselines (kiro-minimax review)
- Address "from-scratch" vs "pretrained" distinction more carefully (kiro-minimax review)
- Correct RWKV characterization — RWKV does not use convolutions (kiro-qwen review)
- Clarify "conv-free" terminology — applies to token-mixing only (kiro-qwen review)
- Justify multi-view decoder redundancy / spectral view necessity (kiro-qwen review)
- Populate appendix with reproducibility artifacts and hyperparameter details (deepseek-pro review)
- Add PaSST as a baseline (deepseek-pro review)