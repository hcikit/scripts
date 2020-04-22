const AWS = require("aws-sdk");

const chalk = require("chalk");
const inquirer = require("inquirer");

AWS.config.credentialProvider.providers = [
  () => new AWS.EnvironmentCredentials("AWS"),
  () => new AWS.EnvironmentCredentials("AMAZON"),
  () => new AWS.SharedIniFileCredentials(),
  () => new AWS.ProcessCredentials(),
  () => new AWS.TokenFileWebIdentityCredentials(),
];

async function validateAWSCredentials() {
  const STS = new AWS.STS();
  return STS.getCallerIdentity().promise();
}

async function getAWSCredentials() {
  try {
    await validateAWSCredentials();

    console.log(
      `You are using the AWS Key with ID: ${chalk.green(
        AWS.config.credentials.accessKeyId
      )}`
    );

    console.log(
      `The profile name is: ${chalk.green(AWS.config.credentials.profile)}`
    );

    const answer = await inquirer.prompt([
      {
        name: "confirm",
        type: "confirm",
        message: chalk.red("Are these AWS credentials okay?"),
        askAnswered: true,
      },
    ]);

    if (!answer.confirm) {
      await askForCredentials();
      await getAWSCredentials();
    }
  } catch (err) {
    console.log("No AWS credentials found, or credentials invalid.");
    await askForCredentials();
    await getAWSCredentials();
  }
}

async function askForCredentials() {
  const inputtedCredentials = await inquirer.prompt([
    {
      name: "accessKeyId",
      type: "input",
      message: chalk.yellow("Access Key ID:"),
      askAnswered: true,
    },
    {
      name: "secretAccessKey",
      type: "password",
      message: chalk.yellow("Secret Access Key:"),
      askAnswered: true,
    },
  ]);

  AWS.config = new AWS.Config();
  AWS.config.update({
    accessKeyId: inputtedCredentials.accessKeyId,
    secretAccessKey: inputtedCredentials.secretAccessKey,
  });
}

module.exports = getAWSCredentials;
