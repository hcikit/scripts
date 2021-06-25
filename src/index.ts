#!/usr/bin/env node
import yargs from "yargs"

yargs.commandDir("commands/s3").demandCommand().help().argv;
