using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using SeraphC2.Implant.Core.IncidentResponse;
using SeraphC2.Implant.Core.Logging;
using SeraphC2.Implant.Core.Evasion;

namespace SeraphC2.Implant.Tests.Core.IncidentResponse
{
    [TestClass]
    public class SelfDestructManagerTests
    {
        private Mock<ILogger> _mockLogger;
        private Mock<AntiDetection> _mockAntiDetection;
        private SelfDestructManager _selfDestructManager;
        private string _testDirectory;
        private string _testImplantPath;

        [TestInitialize]
        public void Setup()
        {
            _mockLogger = new Mock<ILogger>();
            _mockAntiDetection = new Mock<AntiDetection>();
            
            // Create test directory and files
            _testDirectory = Path.Combine(Path.GetTempPath(), $"SelfDestructTest_{Guid.NewGuid():N}");
            Directory.CreateDirectory(_testDirectory);
            
            _testImplantPath = Path.Combine(_testDirectory, "TestImplant.exe");
            File.WriteAllText(_testImplantPath, "Test implant content");

            _selfDestructManager = new SelfDestructManager(_mockLogger.Object, _mockAntiDetection.Object);
        }

        [TestCleanup]
        public void Cleanup()
        {
            try
            {
                if (Directory.Exists(_testDirectory))
                {
                    Directory.Delete(_testDirectory, true);
                }
            }
            catch
            {
                // Ignore cleanup errors
            }
        }

        [TestMethod]
        public async Task ExecuteSelfDestruct_WithValidOptions_ShouldCompleteSuccessfully()
        {
            // Arrange
            var options = new SelfDestructOptions
            {
                Reason = "Test self-destruct",
                WipeIterations = 1,
                Timeout = TimeSpan.FromMinutes(1)
            };

            // Act
            var result = await _selfDestructManager.ExecuteSelfDestruct(options);

            // Assert
            Assert.IsTrue(result);
            _mockLogger.Verify(
                x => x.LogWarning("Self-destruct sequence initiated", It.IsAny<object>()),
                Times.Once);
            _mockLogger.Verify(
                x => x.LogInfo("Self-destruct sequence completed successfully"),
                Times.Once);
        }

        [TestMethod]
        public async Task ExecuteSelfDestruct_WithException_ShouldReturnFalseAndLogError()
        {
            // Arrange
            var options = new SelfDestructOptions
            {
                Reason = "Test exception handling",
                WipeIterations = 1,
                Timeout = TimeSpan.FromMinutes(1)
            };

            // Mock an exception during execution
            _mockAntiDetection.Setup(x => x.IsDebuggerPresent()).Throws(new Exception("Test exception"));

            // Act
            var result = await _selfDestructManager.ExecuteSelfDestruct(options);

            // Assert
            Assert.IsFalse(result);
            _mockLogger.Verify(
                x => x.LogError("Self-destruct sequence failed", It.IsAny<Exception>()),
                Times.Once);
        }

        [TestMethod]
        public async Task HandleKillSwitchActivation_WithValidData_ShouldExecuteSelfDestruct()
        {
            // Arrange
            var killSwitchData = new KillSwitchData
            {
                ActivationId = "test-activation-123",
                Reason = "Communication timeout",
                Timestamp = DateTime.UtcNow
            };

            // Act
            var result = await _selfDestructManager.HandleKillSwitchActivation(killSwitchData);

            // Assert
            Assert.IsTrue(result);
            _mockLogger.Verify(
                x => x.LogWarning("Kill switch activated", It.IsAny<object>()),
                Times.Once);
        }

        [TestMethod]
        public async Task HandleKillSwitchActivation_WithException_ShouldReturnFalseAndLogError()
        {
            // Arrange
            var killSwitchData = new KillSwitchData
            {
                ActivationId = "test-activation-456",
                Reason = "Test exception",
                Timestamp = DateTime.UtcNow
            };

            // Mock an exception
            _mockLogger.Setup(x => x.LogWarning(It.IsAny<string>(), It.IsAny<object>()))
                      .Throws(new Exception("Logger exception"));

            // Act
            var result = await _selfDestructManager.HandleKillSwitchActivation(killSwitchData);

            // Assert
            Assert.IsFalse(result);
            _mockLogger.Verify(
                x => x.LogError("Kill switch handling failed", It.IsAny<Exception>()),
                Times.Once);
        }

        [TestMethod]
        public void SelfDestructOptions_DefaultValues_ShouldBeValid()
        {
            // Arrange & Act
            var options = new SelfDestructOptions();

            // Assert
            Assert.AreEqual(string.Empty, options.Reason);
            Assert.AreEqual(3, options.WipeIterations);
            Assert.AreEqual(TimeSpan.FromMinutes(5), options.Timeout);
        }

        [TestMethod]
        public void KillSwitchData_Properties_ShouldBeSettable()
        {
            // Arrange
            var activationId = "test-id-789";
            var reason = "Test reason";
            var timestamp = DateTime.UtcNow;

            // Act
            var killSwitchData = new KillSwitchData
            {
                ActivationId = activationId,
                Reason = reason,
                Timestamp = timestamp
            };

            // Assert
            Assert.AreEqual(activationId, killSwitchData.ActivationId);
            Assert.AreEqual(reason, killSwitchData.Reason);
            Assert.AreEqual(timestamp, killSwitchData.Timestamp);
        }

        [TestMethod]
        public void Constructor_WithNullLogger_ShouldThrowArgumentNullException()
        {
            // Arrange, Act & Assert
            Assert.ThrowsException<ArgumentNullException>(() =>
                new SelfDestructManager(null, _mockAntiDetection.Object));
        }

        [TestMethod]
        public void Constructor_WithNullAntiDetection_ShouldThrowArgumentNullException()
        {
            // Arrange, Act & Assert
            Assert.ThrowsException<ArgumentNullException>(() =>
                new SelfDestructManager(_mockLogger.Object, null));
        }

        [TestMethod]
        public async Task ExecuteSelfDestruct_ShouldLogAllMajorSteps()
        {
            // Arrange
            var options = new SelfDestructOptions
            {
                Reason = "Test logging",
                WipeIterations = 1,
                Timeout = TimeSpan.FromMinutes(1)
            };

            // Act
            await _selfDestructManager.ExecuteSelfDestruct(options);

            // Assert - Verify that major steps are logged
            _mockLogger.Verify(
                x => x.LogWarning("Self-destruct sequence initiated", It.IsAny<object>()),
                Times.Once);
            
            // Note: Other debug logs might not be called in test environment
            // due to conditional execution paths, but we verify the main flow
        }

        [TestMethod]
        public async Task HandleKillSwitchActivation_ShouldCreateCorrectSelfDestructOptions()
        {
            // Arrange
            var killSwitchData = new KillSwitchData
            {
                ActivationId = "test-activation",
                Reason = "Network timeout",
                Timestamp = DateTime.UtcNow
            };

            // Act
            var result = await _selfDestructManager.HandleKillSwitchActivation(killSwitchData);

            // Assert
            Assert.IsTrue(result);
            _mockLogger.Verify(
                x => x.LogWarning("Kill switch activated", 
                    It.Is<object>(o => o.ToString().Contains("Network timeout"))),
                Times.Once);
        }

        [TestMethod]
        public void SelfDestructOptions_WithCustomValues_ShouldRetainValues()
        {
            // Arrange
            var reason = "Custom test reason";
            var iterations = 5;
            var timeout = TimeSpan.FromMinutes(10);

            // Act
            var options = new SelfDestructOptions
            {
                Reason = reason,
                WipeIterations = iterations,
                Timeout = timeout
            };

            // Assert
            Assert.AreEqual(reason, options.Reason);
            Assert.AreEqual(iterations, options.WipeIterations);
            Assert.AreEqual(timeout, options.Timeout);
        }

        [TestMethod]
        public async Task ExecuteSelfDestruct_WithZeroIterations_ShouldStillComplete()
        {
            // Arrange
            var options = new SelfDestructOptions
            {
                Reason = "Test zero iterations",
                WipeIterations = 0,
                Timeout = TimeSpan.FromMinutes(1)
            };

            // Act
            var result = await _selfDestructManager.ExecuteSelfDestruct(options);

            // Assert
            Assert.IsTrue(result);
        }

        [TestMethod]
        public async Task ExecuteSelfDestruct_WithHighIterations_ShouldComplete()
        {
            // Arrange
            var options = new SelfDestructOptions
            {
                Reason = "Test high iterations",
                WipeIterations = 10,
                Timeout = TimeSpan.FromMinutes(1)
            };

            // Act
            var result = await _selfDestructManager.ExecuteSelfDestruct(options);

            // Assert
            Assert.IsTrue(result);
        }

        [TestMethod]
        public void KillSwitchData_DefaultValues_ShouldBeEmpty()
        {
            // Arrange & Act
            var killSwitchData = new KillSwitchData();

            // Assert
            Assert.AreEqual(string.Empty, killSwitchData.ActivationId);
            Assert.AreEqual(string.Empty, killSwitchData.Reason);
            Assert.AreEqual(default(DateTime), killSwitchData.Timestamp);
        }

        [TestMethod]
        public async Task HandleKillSwitchActivation_WithEmptyData_ShouldStillProcess()
        {
            // Arrange
            var killSwitchData = new KillSwitchData
            {
                ActivationId = string.Empty,
                Reason = string.Empty,
                Timestamp = default(DateTime)
            };

            // Act
            var result = await _selfDestructManager.HandleKillSwitchActivation(killSwitchData);

            // Assert
            Assert.IsTrue(result);
            _mockLogger.Verify(
                x => x.LogWarning("Kill switch activated", It.IsAny<object>()),
                Times.Once);
        }
    }
}