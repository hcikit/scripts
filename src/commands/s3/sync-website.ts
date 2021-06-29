#!/usr/bin/env node

import S3SyncClient from "s3-sync-client";
import fs from "fs-extra";
import path from "path";
import { appPath } from "../../paths";

// TODO: need to test this

export let command = "s3-sync-website";

export let describe =
  "Use environment variables to sync the build folder with the website.";

exports.handler = async () => {
  const sync = new S3SyncClient({});

  let dir = path.join(appPath, "build");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    await sync.bucketWithLocal(dir, process.env.AWS_WEBSITE_BUCKET);
  }
  // aws s3 sync /path/to/local/dir s3://mybucket2
};
