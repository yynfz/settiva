# Issue tracker: GitHub

Issues and specs live in `yynfz/settiva`. Use the `gh` CLI.

Before creating issues, verify the target with:
`gh repo view --json nameWithOwner`.

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open`
- Comment: `gh issue comment <number> --body-file <file>`
- Label: `gh issue edit <number> --add-label "..." --remove-label "..."`
- Close: post an explanation, then `gh issue close <number>`.

Use native sub-issues and blocking dependencies when supported.
Otherwise, record `Part of #<parent>` and `Blocked by: #<number>`
at the top of issue bodies. Work begins when every blocker is closed.

“Publish to the issue tracker” means create a GitHub issue.
“Fetch the relevant ticket” means read the GitHub issue.

## Pull requests as a triage surface

PRs as a request surface: no.
