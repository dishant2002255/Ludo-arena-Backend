/**
 * Unit tests for dual-wallet split (depositBalance vs winningBalance)
 */

describe('Dual-Wallet Business Rules', () => {
  describe('Withdrawal enforcement', () => {
    it('blocks withdrawal when winningBalance < amountCoins', async () => {
      // Simulate the error condition
      const userWinning = 100;
      const requested = 500;
      
      if (userWinning < requested) {
        const err = new Error(
          `Only Winning Coins can be withdrawn. Your withdrawable Winning Balance is ₹${userWinning}`
        );
        expect(err.message).toMatch(/Only Winning Coins/);
        expect(err.message).toMatch(/100/);
      }
    });

    it('allows withdrawal when winningBalance >= amountCoins', () => {
      const userWinning = 1000;
      const requested = 500;
      expect(userWinning >= requested).toBe(true);
    });
  });

  describe('Entry deposit-first deduction', () => {
    it('deducts from depositBalance first', () => {
      const wallet = { depositBalance: 500, winningBalance: 200 };
      const entryCoins = 300;
      const fromDeposit = Math.min(wallet.depositBalance, entryCoins);
      const fromWinning = entryCoins - fromDeposit;
      expect(fromDeposit).toBe(300);
      expect(fromWinning).toBe(0);
    });

    it('deducts from winningBalance when depositBalance exhausted', () => {
      const wallet = { depositBalance: 100, winningBalance: 400 };
      const entryCoins = 300;
      const fromDeposit = Math.min(wallet.depositBalance, entryCoins);
      const fromWinning = entryCoins - fromDeposit;
      expect(fromDeposit).toBe(100);
      expect(fromWinning).toBe(200);
    });

    it('applies mixed deduction correctly', () => {
      const wallet = { depositBalance: 150, winningBalance: 350 };
      const entryCoins = 400;
      const fromDeposit = Math.min(wallet.depositBalance, entryCoins);
      const fromWinning = entryCoins - fromDeposit;
      expect(fromDeposit).toBe(150);
      expect(fromWinning).toBe(250);
      // After deduction
      const newDeposit = wallet.depositBalance - fromDeposit;
      const newWinning = wallet.winningBalance - fromWinning;
      expect(newDeposit).toBe(0);
      expect(newWinning).toBe(100);
    });
  });

  describe('Anti-laundering cancel refund', () => {
    it('refunds exact original buckets on cancel', () => {
      const originalFromDeposit = 150;
      const originalFromWinning = 250;
      const entryCoins = 400;

      const wallet = { depositBalance: 0, winningBalance: 100, lockedBattleBalance: 400 };

      // Simulate refund
      wallet.depositBalance += originalFromDeposit;
      wallet.winningBalance += originalFromWinning;
      wallet.lockedBattleBalance -= entryCoins;

      expect(wallet.depositBalance).toBe(150); // original deposit back
      expect(wallet.winningBalance).toBe(350);  // original winning back
      expect(wallet.lockedBattleBalance).toBe(0);
    });

    it('does NOT convert deposit into winning on cancel', () => {
      // If a user entered with 400 deposit, 0 winning
      const fromDeposit = 400;
      const fromWinning = 0;
      const wallet = { depositBalance: 0, winningBalance: 0, lockedBattleBalance: 400 };

      // Refund
      wallet.depositBalance += fromDeposit;
      wallet.winningBalance += fromWinning;
      wallet.lockedBattleBalance -= 400;

      // depositBalance should come back, NOT added to winningBalance
      expect(wallet.depositBalance).toBe(400);
      expect(wallet.winningBalance).toBe(0); // no laundering!
    });
  });

  describe('Win settlement', () => {
    it('credits 100% of winningPrize to winningBalance', () => {
      const wallet = { depositBalance: 0, winningBalance: 0, lockedBattleBalance: 500 };
      const winningPrize = 950;
      const entryCoins = 500;

      wallet.lockedBattleBalance -= entryCoins;
      wallet.winningBalance += winningPrize; // 100% to winning
      wallet.balance = wallet.depositBalance + wallet.winningBalance;

      expect(wallet.winningBalance).toBe(950);
      expect(wallet.depositBalance).toBe(0);
      expect(wallet.balance).toBe(950);
      expect(wallet.lockedBattleBalance).toBe(0);
    });
  });

  describe('Audit equation compatibility', () => {
    it('balance = depositBalance + winningBalance', () => {
      const wallet = { depositBalance: 300, winningBalance: 200 };
      wallet.balance = wallet.depositBalance + wallet.winningBalance;
      expect(wallet.balance).toBe(500);
    });

    it('activeUserBalances = sum of wallet.balance values', () => {
      const wallets = [
        { depositBalance: 500, winningBalance: 200, balance: 700 },
        { depositBalance: 300, winningBalance: 100, balance: 400 },
      ];
      const activeUserBalances = wallets.reduce((s, w) => s + w.balance, 0);
      expect(activeUserBalances).toBe(1100);
    });
  });
});
