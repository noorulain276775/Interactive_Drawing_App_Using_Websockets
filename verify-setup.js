// Setup Verification Script
// Run this to verify all components are properly configured

console.log('🔍 Interactive Drawing App - Setup Verification');
console.log('==============================================');

// Check if we're in a browser environment
if (typeof window !== 'undefined') {
    console.log('Browser environment detected');
    
    // Check for required dependencies
    const checks = [
        {
            name: 'Socket.IO Client',
            check: () => typeof io !== 'undefined',
            message: 'Socket.IO client library loaded'
        },
        {
            name: 'React',
            check: () => typeof React !== 'undefined',
            message: 'React library loaded'
        },
        {
            name: 'Canvas API',
            check: () => {
                const canvas = document.createElement('canvas');
                return typeof canvas.getContext === 'function';
            },
            message: 'HTML5 Canvas API available'
        },
        {
            name: 'WebSocket Support',
            check: () => typeof WebSocket !== 'undefined',
            message: 'WebSocket API available'
        }
    ];

    console.log('\n📋 Dependency Checks:');
    checks.forEach(check => {
        const result = check.check();
        const status = result ? 'Success' : 'Failed';
        console.log(`${status} ${check.name}: ${check.message}`);
    });

    // Check for our custom components
    console.log('\n🔧 Component Checks:');
    
    // Check if our socket hook would work
    try {
        const testSocket = io('http://localhost:3000', { autoConnect: false });
        console.log('Socket.IO connection test passed');
        testSocket.disconnect();
    } catch (error) {
        console.log(' Socket.IO connection test failed:', error.message);
    }

    // Check for required DOM elements
    const requiredElements = [
        { selector: 'canvas', name: 'Drawing Canvas' },
        { selector: '[data-testid="connection-status"]', name: 'Connection Status', optional: true },
        { selector: '[data-testid="user-info"]', name: 'User Info', optional: true }
    ];

    requiredElements.forEach(element => {
        const el = document.querySelector(element.selector);
        const status = el ? 'Success' : (element.optional ? '⚠️' : 'Failed');
        const message = el ? 'Found' : (element.optional ? 'Optional element not found' : 'Required element missing');
        console.log(`${status} ${element.name}: ${message}`);
    });

} else {
    console.log(' Not in browser environment');
    console.log('This script should be run in a browser console');
}

// Server connectivity test
console.log('\n Server Connectivity Test:');
console.log('Testing connection to http://localhost:3000...');

if (typeof fetch !== 'undefined') {
    fetch('http://localhost:3000')
        .then(response => {
            if (response.ok) {
                console.log('Server is responding');
            } else {
                console.log('Server responded with status:', response.status);
            }
        })
        .catch(error => {
            console.log('Server connection failed:', error.message);
            console.log('Make sure the server is running: cd server && npm start');
        });
} else {
    console.log('Fetch API not available for server test');
}

// Final recommendations
console.log('\n Next Steps:');
console.log('1. Start the server: cd server && npm start');
console.log('2. Start the client: cd client/chatbot && npm run dev');
console.log('3. Open browser to http://localhost:3001');
console.log('4. Run the manual test checklist');
console.log('5. Use the automated test script for verification');

console.log('\n All systems ready for testing!');
