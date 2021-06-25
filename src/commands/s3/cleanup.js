#!/usr/bin/env node
/* eslint-disable no-unused-expressions */

"use strict";

const chalk = require("chalk");
const AWS = require("aws-sdk");
const inquirer = require("inquirer");
const _ = require("lodash");
const fs = require("fs");
const os = require("os");
const getAWSCredentials = require("../../aws-credentials");

const paths = require("../../paths");

// TODO: have something check if AWS and what not is setup properly
// TODO: Explaining how to setup credentials is tricky, it would be nice if there was a better way.
// TODO: should use a better way to get the region.

exports.command = "s3-cleanup";

exports.builder = {
  region: {
    default: "us-east-2",
    alias: ["aws-region", "r"],
  },
};

exports.describe =
  "Uses the app name from package.json and deletes all related S3 storage items from AWS.";

const appPackage = require(paths.appPackageJson);

exports.handler = async ({ region }) => {
  // TODO: Read the region from the deploy script maybe?

  await getAWSCredentials();
  AWS.config.update({ region });

  const s3 = new AWS.S3();
  const cognito = new AWS.CognitoIdentity();
  const iam = new AWS.IAM();

  let appName = appPackage.name;

  await deleteScripts(appName);
  await deleteUploads(appName, s3, cognito, iam);
  await deleteWebsite(appName, s3);

  console.log("Cleanup complete.");
};

async function emptyBucket(Bucket, s3) {
  let objects = [];
  let lastRequest;
  do {
    lastRequest = await s3.listObjects({ Bucket }).promise();
    objects = [...objects, ...lastRequest.Contents];
  } while (lastRequest.isTruncated);

  return Promise.all(
    _.chunk(objects, 999).map((o) => {
      s3.deleteObjects({
        Bucket,
        Delete: { Objects: o.map(({ Key }) => ({ Key })) },
      }).promise();
    })
  );
}

// //TODO: this should use the node API so there isn't a dependency of a CLI application
async function deleteScripts() {
  if (!appPackage.scripts) {
    return Promise.resolve();
  }
  delete appPackage.scripts.deploy;
  delete appPackage.scripts.predeploy;
  delete appPackage.scripts["sync-data"];

  return fs.promises.writeFile(
    paths.appPackageJson,
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

async function deleteUploads(appName, s3, cognito, iam) {
  appName = `${appName}-uploads`;

  const answer = await inquirer.prompt([
    {
      name: "confirm",
      type: "confirm",
      message: chalk.red(
        "This is a destructive action! It deletes the uploads bucket, pool and IAM role."
      ),
    },
  ]);

  if (answer.confirm) {
    try {
      await emptyBucket(appName, s3);
      console.log(chalk.green(`Emptied bucket ${appName}.`));

      await s3.deleteBucket({ Bucket: appName }).promise();
      console.log(chalk.green(`Deleted bucket ${appName}.`));
    } catch (e) {
      console.log(
        "Bucket not deleted: " + chalk.red(e.message + " " + appName)
      );
    }

    const IdentityPoolName = appName.replace(/[^\w]/g, "_");
    var RoleName = `Cognito_${IdentityPoolName}Unauth_Role`;

    await deleteIdentityPool(IdentityPoolName, cognito);
    await deleteIamRole(RoleName, iam);
  }
}

async function deleteIamRole(RoleName, iam) {
  try {
    await iam
      .deleteRolePolicy({
        RoleName,
        PolicyName: "S3",
      })
      .promise();
    console.log(chalk.green(`Role Policy deleted.`));
  } catch (e) {
    console.log("Role policy not deleted: " + chalk.red(e.message));
  }

  try {
    await iam.deleteRole({ RoleName }).promise();
    console.log(chalk.green(`Deleted IAM Role ${RoleName}.`));
  } catch (e) {
    console.log("Role not deleted: " + chalk.red(e.message));
  }
}
async function deleteIdentityPool(IdentityPoolName, cognito) {
  const pools = await cognito.listIdentityPools({ MaxResults: 60 }).promise();

  const IdentityPool = _.find(pools.IdentityPools, {
    IdentityPoolName,
  });

  if (IdentityPool) {
    const IdentityPoolId = IdentityPool.IdentityPoolId;
    try {
      await cognito.deleteIdentityPool({ IdentityPoolId }).promise();
      console.log(chalk.green(`Deleted cognito pool ${IdentityPoolName}.`));
    } catch (e) {
      console.log("Cognito pool not deleted: " + chalk.red(e.message));
    }
  } else {
    console.log(
      "Cognito pool not deleted: " + chalk.red("No identity pool found")
    );
  }
}

async function deleteWebsite(appName, s3) {
  const answer = await inquirer.prompt([
    {
      name: "confirm",
      type: "confirm",
      message: chalk.red(
        "This is a destructive action! It deletes the website bucket."
      ),
    },
  ]);

  if (answer.confirm) {
    try {
      await emptyBucket(appName, s3);
      console.log(chalk.green(`Emptied bucket ${appName}.`));

      await s3.deleteBucket({ Bucket: appName }).promise();
      console.log(chalk.green("Website bucket deleted"));
    } catch (e) {
      console.log(
        "Bucket not deleted: " + chalk.red(e.message + " " + appName)
      );
    }
  }
}
