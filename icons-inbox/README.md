# icons-inbox

Drop the **official icon zips** here, then run:

```
dgm icons update
```

It detects whether each zip is Azure or AWS, extracts the icons to `.dgm/icons/<azure|aws>/`, and **deletes the zip**
(use `--keep` to keep it). Zips it does not recognise are left untouched.

Download them yourself from the official pages (read their terms):

- Azure — https://learn.microsoft.com/azure/architecture/icons/  ("Download SVG icons")
- AWS — https://aws.amazon.com/architecture/icons/  ("Asset Package")

Everything in this folder except this file is git-ignored: the official icons are never committed.
Run the same command again whenever you want to refresh them with a newer release.
