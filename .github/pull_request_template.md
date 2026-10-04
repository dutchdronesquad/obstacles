## Summary

<!-- What does this change? For a collection: club, texture sets and templates. -->

## Collection checklist

<!-- Skip this section for changes that do not add or update artwork. -->

- [ ] Sources are in `collections/<slug>/source/` and exported with `npm run textures:export`.
- [ ] `manifest.json` lists author, attribution, `usage.terms` and `usage.portable`, and the collection `README.md` explains the sources.
- [ ] I own the artwork or have permission to publish it; no third-party branding is copied without permission.
- [ ] `npm run assets:check` and `npm test` pass.
- [ ] I reviewed my contact sheet (`npm run textures:preview -- <slug>`): panels on the right side, top edges and reading direction correct.
- [ ] New collections use `"status": "example"`; a maintainer publishes after review.
