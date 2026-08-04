# ON-DEMAND serve of the RGS web app over Tailscale at
# https://tommys-mac-mini.tail59a169.ts.net:8443/ — the only surface the app has, since
# Phase 3 deleted the Cloudflare Pages project. serve_web.py = static web/dist + an /api
# reverse proxy that injects the vended X-RGS-Key wall credential server-side.
#
# It was a long-running `service` until 2026-08-04 and that was the wrong shape. With
# `reschedule { attempts = 0 }`, one lost allocation — a mini reboot is enough — killed it
# permanently and silently. It died 2026-07-02 and nobody noticed for a month, because a
# thing you look at occasionally has no one watching it.
#
# So: dispatch it when you want to look at the app, stop it when you are done.
#
#   ON   → nomad job dispatch rgs-web-serve
#   OFF  → nomad job stop <dispatch-id>        # from `nomad job status rgs-web-serve`
#
# Stopping tears the :8443 tailnet route down too (see run-rgs-web-serve.sh), so the port
# is either working or absent — never a 502 that reads as a broken deployment.
#
# Build/refresh the bundle (manual until the Phase-3 auto-rebuild):
#   cd /Volumes/dev/robot-geographical-society/web && npm ci \
#     && VITE_MAPBOX_ACCESS_TOKEN=$(terraform -chdir=/Volumes/dev/infra/mapbox output -raw rgs_web_token) \
#        npm run build
#
# Prereqs: tailscale on PATH + the tailscale-serve NOPASSWD sudoers rule (on the mini),
# ~/.local/bin/rgs-vend (Access service-token vendor).
job "rgs-web-serve" {
  type        = "batch"
  datacenters = ["*"]

  # Dispatch-only: the job exists registered but idle, and each `nomad job dispatch`
  # creates one instance that runs until it is stopped. A batch job cannot be
  # accidentally left "on" by a deploy the way the old service could.
  parameterized {}

  group "web" {
    count = 1

    # No restart, no reschedule — on purpose. This is a foreground tool you asked for:
    # if it fails, the right feedback is a dead dispatch you can read the logs of, not a
    # silent retry loop. The previous shape retried three times and then failed forever
    # with no signal, which is the worst of both.
    restart {
      attempts = 0
      mode     = "fail"
    }

    task "serve" {
      driver       = "raw_exec"
      kill_timeout = "30s"
      kill_signal  = "SIGTERM"

      env {
        PATH = "/Users/tommydoerr/.volta/bin:/Users/tommydoerr/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        HOME = "/Users/tommydoerr"
      }

      config {
        command = "/bin/zsh"
        args    = ["/Users/tommydoerr/dev/robot-geographical-society/nomad/run-rgs-web-serve.sh"]
      }

      resources {
        cpu    = 500
        memory = 256
      }
    }
  }
}
