import { describe, it, expect } from 'vitest'
import { isDangerousCommand, clampSshTimeout } from '../../electron/connectors/ssh'

describe('clampSshTimeout (#18: некорректный timeout → не мгновенный kill)', () => {
  it('отрицательный / ноль / NaN / undefined → дефолт (60s), не мгновенный kill', () => {
    expect(clampSshTimeout(-5000)).toBe(60_000)
    expect(clampSshTimeout(0)).toBe(60_000)
    expect(clampSshTimeout('abc')).toBe(60_000)
    expect(clampSshTimeout(undefined)).toBe(60_000)
    expect(clampSshTimeout(null)).toBe(60_000)
  })
  it('валидный таймаут клампится в [1s, 600s]', () => {
    expect(clampSshTimeout(30_000)).toBe(30_000)
    expect(clampSshTimeout(500)).toBe(1_000)       // ниже минимума
    expect(clampSshTimeout(9_999_999)).toBe(600_000) // выше максимума
  })
})

describe('isDangerousCommand', () => {
  it('блокирует rm -rf /', () => {
    expect(isDangerousCommand('rm -rf /')).not.toBeNull()
    expect(isDangerousCommand('rm -rf /var')).not.toBeNull()
    expect(isDangerousCommand('rm -Rf /')).not.toBeNull()
  })

  it('блокирует mkfs', () => {
    expect(isDangerousCommand('mkfs.ext4 /dev/sda')).not.toBeNull()
  })

  it('блокирует dd на устройство', () => {
    expect(isDangerousCommand('dd if=/dev/zero of=/dev/sda')).not.toBeNull()
  })

  it('блокирует passwd', () => {
    expect(isDangerousCommand('passwd root')).not.toBeNull()
    expect(isDangerousCommand('sudo passwd')).not.toBeNull()
  })

  it('блокирует su и sudo su', () => {
    expect(isDangerousCommand('su -')).not.toBeNull()
    expect(isDangerousCommand('sudo su')).not.toBeNull()
  })

  it('блокирует запись в системные директории', () => {
    expect(isDangerousCommand('echo foo > /etc/passwd')).not.toBeNull()
    expect(isDangerousCommand('cat log > /var/log/auth.log')).not.toBeNull()
  })

  it('блокирует systemctl stop/disable', () => {
    expect(isDangerousCommand('systemctl stop ssh')).not.toBeNull()
    expect(isDangerousCommand('systemctl disable nginx')).not.toBeNull()
  })

  it('блокирует iptables -F', () => {
    expect(isDangerousCommand('iptables -F')).not.toBeNull()
  })

  it('блокирует chmod 777 /', () => {
    expect(isDangerousCommand('chmod 777 /')).not.toBeNull()
  })

  it('блокирует forkbomb', () => {
    expect(isDangerousCommand(':(){:|:&};:')).not.toBeNull()
  })

  it('пропускает обычные команды', () => {
    expect(isDangerousCommand('ls -la')).toBeNull()
    expect(isDangerousCommand('cd /opt/los && python script.py')).toBeNull()
    expect(isDangerousCommand('cat /etc/os-release')).toBeNull()  // read /etc допускается
    expect(isDangerousCommand('grep error /var/log/syslog')).toBeNull()  // read /var/log допускается
    expect(isDangerousCommand('source venv/bin/activate && python -c "print(1)"')).toBeNull()
    expect(isDangerousCommand('rm -rf /tmp/cache')).toBeNull()  // не корень
  })
})
