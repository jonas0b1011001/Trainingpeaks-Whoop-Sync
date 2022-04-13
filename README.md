# Trainingpeaks-Whoop-Sync
Google Apps Script to automatically create Whoop workouts based on your Trainingpeaks Workouts

## What it does
The script will periodically pull today's workouts from your TP account and create an equivalent (start, end and specific workout type) workout in your Whoop account.

## Setup Instructions
- Visit https://script.google.com/home
- Create a *new project*
- Copy over **code.gs** from this repo
- Enter your Trainingpeaks & Whoop login credentials at the top
- Run *Main()* to perform a single sync or *scheduleSync* to make the script automatically run every 5 minutes

## Permissions
Prior first execution you will have to allow the script to:
- Access external services -> using the Trainingpeaks & Whoop API
- Automatically run in the background -> automatically check for new TP workouts
