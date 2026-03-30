param(
    [int]$Port = 5500,
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

function Get-ContentType([string]$Path) {
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".svg"  { "image/svg+xml" }
        default { "application/octet-stream" }
    }
}

function Send-Response($Client, [int]$StatusCode, [string]$StatusText, [byte[]]$Body, [string]$ContentType) {
    $stream = $Client.GetStream()
    $writer = [System.IO.StreamWriter]::new($stream, [System.Text.Encoding]::ASCII, 1024, $true)
    $writer.NewLine = "`r`n"
    $writer.WriteLine("HTTP/1.1 $StatusCode $StatusText")
    $writer.WriteLine("Content-Type: $ContentType")
    $writer.WriteLine("Content-Length: $($Body.Length)")
    $writer.WriteLine("Connection: close")
    $writer.WriteLine()
    $writer.Flush()
    $stream.Write($Body, 0, $Body.Length)
    $stream.Flush()
    $writer.Dispose()
    $stream.Dispose()
    $Client.Close()
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
$listener.Start()

Write-Host "Bravo Finance Tracker server running at http://127.0.0.1:$Port/"
Write-Host "Serving files from $Root"
Write-Host "Press Ctrl+C to stop."

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()

        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()

            while ($reader.Peek() -ge 0) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrWhiteSpace($line)) {
                    break
                }
            }

            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Bad Request")
                Send-Response $client 400 "Bad Request" $body "text/plain; charset=utf-8"
                continue
            }

            $parts = $requestLine.Split(" ")
            $method = $parts[0]
            $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

            if ($method -ne "GET") {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")
                Send-Response $client 405 "Method Not Allowed" $body "text/plain; charset=utf-8"
                continue
            }

            $cleanPath = $rawPath.Split("?")[0].TrimStart("/")
            if ([string]::IsNullOrWhiteSpace($cleanPath)) {
                $cleanPath = "index.html"
            }

            $relativePath = $cleanPath.Replace("/", "\")
            $fullPath = Join-Path $Root $relativePath

            if ((Test-Path $fullPath) -and -not (Get-Item $fullPath).PSIsContainer) {
                $body = [System.IO.File]::ReadAllBytes($fullPath)
                Send-Response $client 200 "OK" $body (Get-ContentType $fullPath)
            }
            else {
                $body = [System.Text.Encoding]::UTF8.GetBytes("404 - File not found")
                Send-Response $client 404 "Not Found" $body "text/plain; charset=utf-8"
            }
        }
        catch {
            try {
                $body = [System.Text.Encoding]::UTF8.GetBytes("500 - Internal Server Error")
                Send-Response $client 500 "Internal Server Error" $body "text/plain; charset=utf-8"
            }
            catch {
                $client.Close()
            }
        }
    }
}
finally {
    $listener.Stop()
}
