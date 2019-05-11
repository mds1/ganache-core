import Ganache from "../index"
import assert from "assert";
import Provider from "../src/provider";

describe("provider", () => {
  const networkId = "1234";
  let p: Provider;

  beforeEach("set up", () =>{
    p = Ganache.provider({
      network_id: networkId
    });
  });

  it("works without passing options", async() => {
    assert.doesNotThrow(() => Ganache.provider());
  });

  it("it logs when `options.verbose` is `true`", async() => {
    const logger = {
      log: (msg: string) => {
        assert.strictEqual(msg, "   >  net_version: undefined");
      }
    };
    const p = Ganache.provider({logger, verbose: true});

    logger.log = (msg) => {
      assert.strictEqual(msg, "   >  net_version: undefined", "doesn't work when no params");
    };
    await p.send("net_version");

    return new Promise(async (resolve) => {
      logger.log = (msg) => {
        const expected = "   >  web3_sha3: [\n" +
          "   >   \"Tim is a swell guy.\"\n" +
          "   > ]";
        assert.strictEqual(msg, expected, "doesn't work with params");
        resolve();
      };
      await p.send("web3_sha3", ["Tim is a swell guy."]);
    });
  }).timeout(500);

  it("it logs with options.verbose", async() => {
    assert.doesNotThrow(() => Ganache.provider());
  });

  it("it processes requests asyncronously when `asyncRequestProcessing` is default (true)", async() => {
    const p = Ganache.provider();
    const accounts = await p.send("eth_accounts");
    // eth_accounts should always be faster than eth_getBalance; it should
    // return before eth_getBalance because of the `asyncRequestProcessing` flag
    const calA = p.send("eth_getBalance", [accounts[0]]);
    const callB = p.send("eth_accounts");
    const result = await Promise.race([calA, callB]);
    assert(Array.isArray(result));
    assert.strictEqual(result.length, 10);
  });

  it("it processes requests in order when `asyncRequestProcessing` is false", async() => {
    const p = Ganache.provider({asyncRequestProcessing: false});
    const accounts = await p.send("eth_accounts");
    // eth_accounts should always be faster than eth_getBalance, but shouldn't
    // return before eth_getBalance because of the `asyncRequestProcessing` flag
    const callA = p.send("eth_getBalance", [accounts[0]]);
    const callB = p.send("eth_accounts");
    const result = await Promise.race([callA, callB]);
    assert.strictEqual(typeof result, "string");
    // TODO: this value is wrong:
    assert.strictEqual(result, "0x056bc75e2d63100000");
  });

  it("gets balance", async() => {
    const accounts = await p.send("eth_accounts");
    const balance = await p.send("eth_getBalance", [accounts[0]]);
    // TODO: this value is actually wrong!
    assert.strictEqual(balance, "0x056bc75e2d63100000", "Heyo!");
  })
  it.skip("sends a transaction", async () => {
    const accounts = await p.send("eth_accounts");
    const to = accounts[accounts.length - 1];

    await p.send("eth_sendTransaction", [{
      from: accounts[0],
      to: to,
      value: 10_000,
      nonce: 0,
      gasPrice: 100
    }]);
    await p.send("eth_sendTransaction", [{
      from: accounts[0],
      to: to,
      value: 20_000,
      nonce: 0,
      gasPrice: 200
    }]);
    await p.send("eth_sendTransaction", [{
      from: accounts[2],
      to: to,
      value: 30_000,
      nonce: 0,
      gasPrice: 300
    }]);

  });
  it.skip("sends a transaction", async () => {
    const seedrandom = require("seedrandom");
    const rand = seedrandom("sup");
    const accounts = await p.send("eth_accounts");

    const nonces = [5, 3, 2, 1, 0];
    const to = accounts[accounts.length - 1];


    const id = setImmediate(()=>{console.log(1)});
    p.send("eth_sendTransaction", [{
      from: accounts[0],
      to: to,
      value: 10_000,
      nonce: nonces[2],
      gasPrice: (rand() * 100) | 0
    }]);
    clearImmediate(id);

    // for every account (except the last one)
    for (let j = 0; j < accounts.length - 6; j++) {
      for (let i = 0; i < nonces.length; i++) {
      // send transactions with our random nonces
        await p.send("eth_sendTransaction", [{
          from: accounts[j],
          to: to,
          value: 10_000,
          nonce: nonces[i],
          gasPrice: (rand() * 100) | 0
        }]);
      }
    }
  });
  it.skip("returns a transaction", async () => {
    var result = await p.send("eth_getTransactionByHash", ["0x123"]);
    const v = result.blockNumber;
    // todo: figure things out
  })
  it("returns things via EIP-1193", async () => {
    const version = await p.send("net_version");
    assert.strictEqual(version, networkId);
  });
  it("returns things via legacy", async() => {
    await new Promise((resolve) => {
      const ret = p.send({
        id: "1",
        jsonrpc: "2.0",
        method: "net_version"
      } as any, (_err: Error, result: any): void => {
        assert.strictEqual(result.result, networkId);
        resolve();
      });
      assert.strictEqual(ret, undefined);
    });
    return new Promise((resolve) => {
      const ret = p.sendAsync({
        id: "1",
        jsonrpc: "2.0",
        method: "net_version"
      } as any, (_err: Error, result: any): void => {
        assert.strictEqual(result.result, networkId);
        resolve();
      });
      assert.strictEqual(ret, undefined);
    });
  });

  it("rejects invalid rpc methods", async () => {
    const illegalMethodNames = [
      "toString", "toValue", "__proto__", "prototype", "notAFunction", "", " ",
      "constructor", 
    ];
    await Promise.all(illegalMethodNames.map((name) => {
      return assert.rejects(p.send(name), {
        message: `Invalid or unsupported method: ${name}`
      });
    }));

    // duck punch a property that shouldn't appear on the ledger. we test this
    // to make sure that 3rd party ledger imlementations can't shoot themselves
    // in the foot on accident
    (p as any)._engine._ledger.__proto__.illegalProperty = true;
    await assert.rejects(p.send("illegalProperty"), {
      message: "Invalid or unsupported method: illegalProperty"
    });

    // make sure we reject non-strings over the classical send interface
    const circular = {} as any;
    circular.circular = circular;
    const illegalMethodTypes = [
      123, Buffer.from([1]) as any as string, null, undefined, {}, [],
      {foo: "bar"}, [1,2], new Date(), Infinity, NaN, circular
    ];
    await Promise.all(illegalMethodTypes.map((methodType) => {
      return assert.rejects(
        new Promise((resolve, reject) => {
          p.send({
            id: "1",
            jsonrpc: "2.0",
            method: methodType as any
          } as any, (err: Error, result: any): void => {
            if(err) {
              reject(err);
            } else {
              resolve(result);
            }
          })
        }),
      {
        message: `Invalid or unsupported method: ${methodType}`
      });
    }));

    // make sure we reject non-strings over the EIP-1193 send interface
    illegalMethodTypes.map((methodType) => {
      assert.throws(() => p.send(methodType as string), {
        message: "No callback provided to provider's send function. As of " +
          "web3 1.0, provider.send is no longer synchronous and must be " +
          "passed a callback as its final argument."
      });
    });
  });
});
