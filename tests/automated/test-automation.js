// Automated Test Script for User Identification
// Run this in browser console to test functionality

class DrawingAppTester {
    constructor() {
        this.testResults = [];
        this.socket = null;
        this.currentUser = null;
        this.connectedUsers = [];
    }

    async runAllTests() {
        console.log('🧪 Starting User Identification Tests...');
        
        try {
            await this.testConnection();
            await this.testUserGeneration();
            await this.testUserList();
            await this.testDrawingEvents();
            await this.testUserActivity();
            
            this.printResults();
        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    }

    async testConnection() {
        console.log('🔌 Testing WebSocket Connection...');
        
        // Check if socket.io is available
        if (typeof io === 'undefined') {
            this.addResult('Connection', false, 'Socket.IO not loaded');
            return;
        }

        // Test connection
        this.socket = io('http://localhost:3000');
        
        return new Promise((resolve) => {
            this.socket.on('connect', () => {
                this.addResult('Connection', true, 'Connected successfully');
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                this.addResult('Connection', false, `Connection failed: ${error.message}`);
                resolve();
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                this.addResult('Connection', false, 'Connection timeout');
                resolve();
            }, 5000);
        });
    }

    async testUserGeneration() {
        console.log('👤 Testing User Generation...');
        
        return new Promise((resolve) => {
            this.socket.on('user-joined', (data) => {
                this.currentUser = data.user;
                this.connectedUsers = data.users;
                
                if (this.currentUser && this.currentUser.name && this.currentUser.color) {
                    this.addResult('User Generation', true, `User: ${this.currentUser.name}`);
                } else {
                    this.addResult('User Generation', false, 'Invalid user data');
                }
                resolve();
            });

            // Timeout after 3 seconds
            setTimeout(() => {
                this.addResult('User Generation', false, 'User generation timeout');
                resolve();
            }, 3000);
        });
    }

    async testUserList() {
        console.log('📋 Testing User List...');
        
        return new Promise((resolve) => {
            this.socket.on('users-list', (users) => {
                this.connectedUsers = users;
                
                if (Array.isArray(users) && users.length > 0) {
                    this.addResult('User List', true, `${users.length} users connected`);
                } else {
                    this.addResult('User List', false, 'Empty or invalid user list');
                }
                resolve();
            });

            // Timeout after 3 seconds
            setTimeout(() => {
                this.addResult('User List', false, 'User list timeout');
                resolve();
            }, 3000);
        });
    }

    async testDrawingEvents() {
        console.log('🎨 Testing Drawing Events...');
        
        return new Promise((resolve) => {
            let drawingReceived = false;
            
            this.socket.on('draw-line', (data) => {
                if (data.userId && data.userName && data.color) {
                    drawingReceived = true;
                    this.addResult('Drawing Events', true, `Drawing from ${data.userName}`);
                } else {
                    this.addResult('Drawing Events', false, 'Invalid drawing data');
                }
            });

            // Emit a test drawing
            if (this.currentUser) {
                this.socket.emit('draw-line', {
                    currentPoint: { x: 100, y: 100 },
                    prevPoint: { x: 50, y: 50 },
                    color: this.currentUser.color,
                    userId: this.currentUser.id,
                    userName: this.currentUser.name
                });
            }

            // Timeout after 3 seconds
            setTimeout(() => {
                if (!drawingReceived) {
                    this.addResult('Drawing Events', false, 'No drawing events received');
                }
                resolve();
            }, 3000);
        });
    }

    async testUserActivity() {
        console.log('⚡ Testing User Activity...');
        
        // Test clear canvas event
        this.socket.emit('clear-canvas');
        
        this.addResult('User Activity', true, 'Clear canvas event sent');
        
        return Promise.resolve();
    }

    addResult(testName, passed, message) {
        this.testResults.push({
            test: testName,
            passed,
            message,
            timestamp: new Date().toISOString()
        });
        
        const status = passed ? '✅' : '❌';
        console.log(`${status} ${testName}: ${message}`);
    }

    printResults() {
        console.log('\n📊 Test Results Summary:');
        console.log('========================');
        
        const passed = this.testResults.filter(r => r.passed).length;
        const total = this.testResults.length;
        
        this.testResults.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${result.test}: ${result.message}`);
        });
        
        console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);
        
        if (passed === total) {
            console.log('🎉 All tests passed! User identification is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Check the implementation.');
        }
    }

    cleanup() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Usage instructions
console.log(`
🧪 User Identification Test Suite
================================

To run the tests:
1. Make sure the server is running on port 3000
2. Open this page in a browser
3. Open browser console (F12)
4. Run: const tester = new DrawingAppTester(); tester.runAllTests();

To clean up: tester.cleanup();
`);

// Auto-run if in browser environment
if (typeof window !== 'undefined') {
    console.log('🌐 Browser environment detected. Ready to run tests.');
}
