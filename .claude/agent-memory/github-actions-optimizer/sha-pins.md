# Pinned Action SHAs

All SHAs verified via GitHub API on 2026-05-05.
Update this file whenever an action is upgraded.

| Action | Tag | Commit SHA |
|--------|-----|------------|
| actions/checkout | v4.2.2 | `11bd71901bbe5b1630ceea73d27597364c9af683` |
| actions/checkout | v6.0.2 (latest) | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` |
| actions/setup-go | v5.5.0 | `d35c59abb061a4a6fb18e82ac0862c26744d6ab5` |
| actions/setup-go | v6.4.0 (latest) | `4a3601121dd01d1626a1e23e37211e3254c1c06c` |
| actions/setup-node | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| actions/setup-node | v6.4.0 (latest) | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` |
| actions/upload-artifact | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| actions/upload-artifact | v7.0.1 (latest) | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| docker/setup-buildx-action | v3.12.0 | `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` |
| docker/build-push-action | v6.19.2 | `10e90e3645eae34f1e60eeb005ba3a3d33f178e8` |

## Notes
- `actions/checkout` and others have newer major versions (v5, v6) available.
  The project currently targets v4 series — upgrade deliberately after testing.
- `docker/build-push-action` v7 exists; v6 pinned to match current workflow.
  v7 drops some deprecated build args — review changelog before upgrading.
