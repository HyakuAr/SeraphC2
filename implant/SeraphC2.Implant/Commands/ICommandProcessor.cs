using SeraphC2.Implant.Models;

namespace SeraphC2.Implant.Commands;

public interface ICommandProcessor
{
    Task<CommandResult> ProcessCommandAsync(CommandMessage command);
}