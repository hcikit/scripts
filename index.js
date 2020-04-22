#!/usr/bin/env node

/* eslint-disable-line */

require("yargs").commandDir("commands/s3").demandCommand().help().argv;
