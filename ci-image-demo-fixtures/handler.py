"""Fixture for validating the self-contained ci-image security scan: a classic
unsanitized shell=True pattern, flagged by the SAST leaf's Semgrep rules."""

import subprocess


def run_user_command(user_input: str) -> None:
    subprocess.run(user_input, shell=True)
