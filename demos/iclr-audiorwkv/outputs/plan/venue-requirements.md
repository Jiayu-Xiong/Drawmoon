# ICLR 2026 Venue Requirements

**Source:** [ICLR 2026 Author Guide](https://iclr.cc/Conferences/2026/AuthorGuide)
**Template:** [https://github.com/ICLR/Master-Template/raw/master/iclr2026.zip](https://github.com/ICLR/Master-Template/raw/master/iclr2026.zip)
**Submission system:** [https://openreview.net/group?id=ICLR.cc/2026/Conference](https://openreview.net/group?id=ICLR.cc/2026/Conference)

## Page Limits

| Stage | Main text | References | Appendix |
|-------|-----------|------------|----------|
| Submission | **9 pages max** | Unlimited | Unlimited (reviewers not required to read) |
| Camera-ready | 10 pages | Unlimited | Unlimited |

## Formatting

- LaTeX only; style files from ICLR GitHub (`iclr2026_conference.sty`, `.bst`)
- `\usepackage[submission]{iclr2026_conference}` for submission; `\documentclass{article}` + `\usepackage{iclr2026_conference,times}`
- US Letter paper (8.5" x 11"); text block 5.5" x 9"
- Times New Roman, 10pt, 11pt leading
- Title: 17pt small caps left-aligned
- First-level headings: 12pt small caps
- No page number modifications

## Anonymization (Double-Blind)

- `\usepackage[submission]{iclr2026_conference}` auto-anonymizes
- Do NOT uncomment `\iclrfinalcopy` for submission
- Citations to own work must use third person
- arXiv papers by same authors do NOT break anonymity

## Citation Style

- `natbib` with author-year; `\citet{}` for in-sentence, `\citep{}` for parenthetical
- References alphabetically ordered; any consistent format
- Bibliography/references DO NOT count toward page limit

## Supplementary Material

- Single file: paper + supplementary text (append after references)
- Mark supplementary clearly as appendix
- Code encouraged; reviewers not required to review supplementary

## Optional Sections (do NOT count toward page limit)

- Ethics Statement (before references, max 1 page)
- Reproducibility Statement (before references)
- Limitations (in appendix)
- LLM Usage Disclosure (in appendix)

## Key Constraints for This Paper

1. Main text MUST fit 9 pages at submission
2. Limitations, ethics, reproducibility, LLM usage → appendix (unlimited)
3. Figures and tables count toward 9-page limit
4. `\input{math_commands.tex}` for standard notation
5. Use `\usepackage{hyperref}`, `\usepackage{url}`
