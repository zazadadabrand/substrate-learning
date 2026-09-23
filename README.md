# Substrate Learning

Reverse engineering specific outcomes into deterministic curricula that compound over time. Built by Bernard Studia.

One substrate stack per discipline. Every atom is taught, timed, and tested inside the system: a from zero lesson, a reference sheet, and a drill with a pass condition. Creative Director is the handcrafted track, sculpted from a cohort of nineteen reference practitioners, with Materials 001 and 005 written by hand. Every commissioned track ships the same three-part module on every atom at the moment the engine spins the stack up.

## Stack
Single file static app: index.html. No build step, no dependencies beyond Google Fonts. Progress persists via the host storage API where available and degrades gracefully where not. Creative Director progress stays in `substrate-cd-v5`. Commissioned tracks stay in `substrate-shell` and open in the same shell. A module button appears on an atom once that atom already has a lesson, a reference, and a drill.

## Protocol
1. Every version is committed to this repository. Version verifiability is a mandate, not a habit.
2. The repository is connected to Vercel. Every push to main deploys automatically. Committed equals live.
3. Commission is two passes and both finish before the track opens. Pass one is the curriculum skeleton: layers and deterministic atoms. Pass two writes a module on every atom, one layer at a time, so the model can finish JSON instead of truncating. A module is a from-zero lesson, a reference sheet, and a drill with a pass condition.
4. Versions increment through Bloom passes: research on the cohort, deeper materials, gap log input, and pace recalibration. Bloom deepens a stack. It is not the first time a module exists.
5. Every material holds one standard: written so simply a kid could learn from it. Creative Director materials stay handcrafted. Commissioned modules are generated, then held to the same standard.

## Deploy
1. Create a GitHub repository and push this folder.
2. In Vercel: Add New Project, import the repository, framework preset Other, no build command, output directory root. Deploy.
3. Every future version arrives as a new commit and goes live on push.
