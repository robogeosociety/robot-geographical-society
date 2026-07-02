# Periodic job: rebuild the RGS web bundle on the mini when main moves, and heartbeat
# the app's liveness to the ops bucket — Phase 3 of the tailnet migration. The serve
# job (rgs-web-serve.hcl) serves web/dist fresh per request, so this rebuild-in-place
# needs no serve restart. ~10-min cadence: code merged to main is live within ~10 min,
# matching the wiki control-loop's "merge → live" story.
#
#   ON  → nomad job run  nomad/rgs-web-build.hcl
#   OFF → nomad job stop rgs-web-build
job "rgs-web-build" {
  type        = "batch"
  datacenters = ["*"]

  periodic {
    cron             = "*/10 * * * *"
    prohibit_overlap = true
  }

  group "build" {
    count = 1

    task "build" {
      driver = "raw_exec"

      env {
        PATH = "/Users/tommydoerr/.volta/bin:/Users/tommydoerr/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        HOME = "/Users/tommydoerr"
      }

      config {
        command = "/bin/zsh"
        args    = ["/Users/tommydoerr/dev/robot-geographical-society/nomad/build-web.sh"]
      }

      resources {
        cpu    = 1000
        memory = 1024
      }
    }
  }
}
