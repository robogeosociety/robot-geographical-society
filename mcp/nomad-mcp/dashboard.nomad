job "dev-dashboard" {
  datacenters = ["dc1"]
  type        = "service"

  group "web" {
    count = 1

    task "server" {
      driver = "raw_exec"

      config {
        command = "/opt/homebrew/bin/node"
        args    = ["/Users/tommydoerr/dev/mcp/nomad-mcp/dashboard/index.js"]
      }

      env {
        PORT = "9000"
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}
