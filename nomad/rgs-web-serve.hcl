# Long-running service serving the RGS web app over Tailscale at its own port
# https://tommys-mac-mini.tail59a169.ts.net:8443/ — Phase 1 of the tailnet migration
# (parallel-run; the Cloudflare Pages surface stays up until Phase 2 tears it down).
# serve_web.py = static web/dist + /api reverse proxy (vended Access service token).
#
#   ON  → nomad job run  nomad/rgs-web-serve.hcl
#   OFF → nomad job stop rgs-web-serve
#
# Build/refresh the bundle (manual until the Phase-3 auto-rebuild):
#   cd /Volumes/dev/robot-geographical-society/web && npm ci \
#     && VITE_MAPBOX_ACCESS_TOKEN=$(terraform -chdir=/Volumes/dev/infra/mapbox output -raw rgs_web_token) \
#        npm run build
#
# Prereqs: tailscale on PATH + the tailscale-serve NOPASSWD sudoers rule (on the mini),
# ~/.local/bin/rgs-vend (Access service-token vendor).
job "rgs-web-serve" {
  type        = "service"
  datacenters = ["*"]

  group "web" {
    count = 1

    restart {
      attempts = 3
      interval = "10m"
      delay    = "15s"
      mode     = "fail"
    }
    reschedule {
      attempts  = 0
      unlimited = false
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
