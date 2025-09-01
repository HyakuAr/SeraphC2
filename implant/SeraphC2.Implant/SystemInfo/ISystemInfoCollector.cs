using SeraphC2.Implant.Models;

namespace SeraphC2.Implant.SystemInfo;

public interface ISystemInfoCollector
{
    Task<SystemInformation> CollectSystemInfoAsync();
}