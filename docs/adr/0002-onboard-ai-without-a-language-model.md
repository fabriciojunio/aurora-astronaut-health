# 2. Onboard AI without a language model

Date: 2026-10-27. Status: accepted.

## Context

The challenge asks for AI support, and the project has to stay free. A cloud model needs a
connection the crew will not always have, costs money per call and sends health data off the
device. A local language model is large, slow on a tablet and can state wrong medical facts with
confidence, which is the failure we can least afford.

## Decision

Use three small, explainable methods that run in the browser:

- Isolation Forest on deviations from each person's own baseline, trained in Python and exported to
  JSON, with parity tests against scikit-learn.
- Theil-Sen regression for dose trends.
- BM25 retrieval over AURORA's own procedures and cited findings for the assistant. Answers are
  assembled from those passages; user text is never treated as an instruction.

## Consequences

- Zero cost, works offline, no health data leaves the device.
- Every flag can be explained: which signals moved and by how much.
- The assistant cannot answer questions outside its knowledge base. It says so instead of guessing.
- The anomaly model is only as good as its training data, which is simulated. The model card says
  where it is weak.
