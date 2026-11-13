## Summary

<!-- What does this change and why? Keep it short. -->

## Related issue

<!-- Closes #123. If there is no issue yet, please open one first for anything beyond a small fix. -->

## What I tested

<!-- Check what you ran and add anything manual. -->

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run check`
- [ ] `npm run smoke:ui` / `npm run test:e2e` (if the UI changed)
- [ ] Manually tried on: <!-- browser, or tablet model and Android version -->

## Checklist

- [ ] Commit messages follow Conventional Commits (`feat(scope): ...`).
- [ ] Money stays in whole Rupiah (no floating-point).
- [ ] A saved sale is never undone by a printing or network failure.
- [ ] Schema changes include a migration in `src/data/migrations.ts` and an update to `database/sqlite-schema.sql`.
- [ ] No secrets, client names, APK files, or AI assistant instruction files are included.
- [ ] Docs and `CHANGELOG.md` (`[Unreleased]`) are updated if behavior changed.

## Caveats

<!-- Known limits, follow-ups, or anything reviewers should look at closely. -->
