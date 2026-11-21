# icons-inbox

One folder per icon pack — **the folder name is the pack id**. Drop the official zips inside, then run:

```
dgm icons update
```

```
icons-inbox/
  azure/   Azure_Public_Service_Icons_V25.zip     -> az-<name>
  aws/     Asset-Package_07312025.….zip           -> aws-<name>
  gcp/     any-zip-of-svgs.zip                    -> gcp-<name>   (any other folder name works the same way)
```

Each zip is extracted to `.dgm/icons/<pack>/` and then **deleted** (`--keep` keeps it). A zip that does not look right
is left untouched and reported. Drop newer zips and run it again to refresh a pack (newest wins).

Official downloads (read their terms): Azure — https://learn.microsoft.com/azure/architecture/icons/ ·
AWS — https://aws.amazon.com/architecture/icons/

Everything here except this README is git-ignored: the official icons are never committed.
