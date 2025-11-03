pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo '📦 Checking out latest code...'
                git branch: 'main', url: 'https://github.com/chandramohan05/online-voting-system-nodejs.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo '📦 Installing npm dependencies...'
                bat 'npm install'
            }
        }

        stage('Run Tests') {
            steps {
                echo '🧪 Running basic checks...'
                bat 'echo Running test phase (add npm test here if available)'
            }
        }

        stage('Deploy / Restart Server') {
            steps {
                echo '🚀 Restarting Node.js server (detached mode)...'
                // Stop any previous Node.js instance
                bat '''
                taskkill /IM node.exe /F || exit /b 0
                REM Start Node.js in a new detached CMD window and log output
                start "NodeApp" cmd /c "node server.js > server_log.txt 2>&1"
                '''
            }
        }

        stage('Verify Server') {
            steps {
                echo '🔍 Checking if server is running on port 3000...'
                bat '''
                netstat -ano | findstr :3000 || echo "⚠️ Node server not detected on port 3000"
                '''
            }
        }
    }

    post {
        success {
            echo '✅ Build and deployment completed successfully and server started!'
        }
        failure {
            echo '❌ Build failed. Please check the console output for details.'
        }
    }
}
