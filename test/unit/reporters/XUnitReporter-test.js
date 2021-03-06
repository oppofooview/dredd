const fsStub = require('fs');
const proxyquire = require('proxyquire').noCallThru();
const sinon = require('sinon');

const { assert } = require('chai');
const { EventEmitter } = require('events');

const loggerStub = require('../../../lib/logger');

const fsExtraStub = { mkdirp(path, cb) { return cb(); } };

const XUnitReporter = proxyquire('../../../lib/reporters/XUnitReporter', {
  '../logger': loggerStub,
  fs: fsStub,
  'fs-extra': fsExtraStub,
});

describe('XUnitReporter', () => {
  let test = {};

  before(() => { loggerStub.transports.console.silent = true; });

  after(() => { loggerStub.transports.console.silent = false; });

  describe('when creating', () => {
    describe('when file exists', () => {
      before(() => {
        sinon.stub(fsStub, 'existsSync').callsFake(() => true);
        sinon.stub(fsStub, 'unlinkSync').callsFake(() => true);
        sinon.stub(loggerStub, 'info');
      });

      after(() => {
        fsStub.existsSync.restore();
        fsStub.unlinkSync.restore();
        loggerStub.info.restore();
      });

      it('should inform about the existing file', () => {
        const emitter = new EventEmitter();
        (new XUnitReporter(emitter, {}, {}, 'test.xml'));
        assert.isOk(loggerStub.info.called);
      });
    });

    describe('when file does not exist', () => {
      before(() => {
        sinon.stub(fsStub, 'existsSync').callsFake(() => false);
        sinon.stub(fsStub, 'unlinkSync');
      });

      after(() => {
        fsStub.existsSync.restore();
        fsStub.unlinkSync.restore();
      });

      it('should create the file', () => {
        const emitter = new EventEmitter();
        (new XUnitReporter(emitter, {}, {}, 'test.xml'));
        assert.isOk(fsStub.unlinkSync.notCalled);
      });
    });
  });

  describe('when starting', () => {
    describe('when can create output directory', () => {
      beforeEach(() => {
        sinon.stub(fsStub, 'appendFileSync');
        sinon.spy(fsExtraStub, 'mkdirp');
      });

      afterEach(() => {
        fsStub.appendFileSync.restore();
        fsExtraStub.mkdirp.restore();
      });

      it('should write opening to file', (done) => {
        const emitter = new EventEmitter();
        (new XUnitReporter(emitter, {}, {}, 'test.xml'));
        emitter.emit('start', '', () => {
          assert.isOk(fsExtraStub.mkdirp.called);
          assert.isOk(fsStub.appendFileSync.called);
          done();
        });
      });
    });

    describe('when cannot create output directory', () => {
      beforeEach(() => {
        sinon.stub(fsStub, 'appendFileSync');
        sinon.stub(loggerStub, 'error');
        sinon.stub(fsExtraStub, 'mkdirp').callsFake((path, cb) => cb('error'));
      });

      after(() => {
        fsStub.appendFileSync.restore();
        loggerStub.error.restore();
        fsExtraStub.mkdirp.restore();
      });

      it('should write to log', (done) => {
        const emitter = new EventEmitter();
        (new XUnitReporter(emitter, {}, {}, 'test.xml'));
        emitter.emit('start', '', () => {
          assert.isOk(fsExtraStub.mkdirp.called);
          assert.isOk(fsStub.appendFileSync.notCalled);
          assert.isOk(loggerStub.error.called);
          done();
        });
      });
    });
  });

  describe('when ending', () => {
    beforeEach(() => {
      sinon.stub(fsStub, 'appendFileSync');
      sinon.stub(fsStub, 'readFile');
      fsStub.readFile.yields(null, 'da\nta');
      sinon.stub(fsStub, 'writeFile');
      fsStub.writeFile.yields(null);
    });

    afterEach(() => {
      fsStub.appendFileSync.restore();
      fsStub.readFile.restore();
      fsStub.writeFile.restore();
    });

    describe('when there is one test', () => {
      it('should write tests to file', () => {
        const emitter = new EventEmitter();
        const xUnitReporter = new XUnitReporter(emitter, {}, {});
        xUnitReporter.tests = [test];
        xUnitReporter.stats.tests = 1;
        emitter.emit('test pass', test);
        assert.isOk(fsStub.appendFileSync.called);
      });

      describe('when the file writes successfully', () => it('should read the file and update the stats', (done) => {
        const emitter = new EventEmitter();
        const xUnitReporter = new XUnitReporter(emitter, {}, {});
        xUnitReporter.tests = [test];
        xUnitReporter.stats.tests = 1;

        emitter.emit('end', () => {
          assert.isOk(fsStub.writeFile.called);
          done();
        });
      }));
    });

    describe('when there are no tests', () => it('should write empty suite', (done) => {
      const emitter = new EventEmitter();
      (new XUnitReporter(emitter, {}, {}));
      emitter.emit('end', () => {
        assert.isOk(fsStub.writeFile.called);
        done();
      });
    }));
  });

  describe('when test passes', () => {
    before(() => {
      test = {
        status: 'pass',
        title: 'Passing Test',
        request: {
          body: '{ "test": "body" }',
          schema: '{ "test": "schema" }',
          headers: {
            Accept: 'application/json',
          },
        },
        expected: {
          body: '{ "test": "body" }',
          schema: '{ "test": "schema" }',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        actual: {
          body: '<html></html>',
          headers: {
            'Content-Type': 'text/html',
          },
        },
      };
    });

    beforeEach(() => sinon.stub(fsStub, 'appendFileSync'));

    afterEach(() => fsStub.appendFileSync.restore());

    it('should write a passing test', () => {
      const emitter = new EventEmitter();
      (new XUnitReporter(emitter, {}, {}, 'test.xml'));
      emitter.emit('test start', test);
      emitter.emit('test pass', test);
      assert.isOk(fsStub.appendFileSync.called);
    });

    describe('when details=true', () => it('should write details for passing tests', () => {
      const emitter = new EventEmitter();
      (new XUnitReporter(emitter, {}, {}, 'test.xml', true));
      emitter.emit('test start', test);
      emitter.emit('test pass', test);
      assert.isOk(fsStub.appendFileSync.called);
    }));
  });

  describe('when test is skipped', () => {
    before(() => {
      test = {
        status: 'skipped',
        title: 'Skipped Test',
      };
    });

    beforeEach(() => sinon.stub(fsStub, 'appendFileSync'));

    afterEach(() => fsStub.appendFileSync.restore());

    it('should write a skipped test', () => {
      const emitter = new EventEmitter();
      (new XUnitReporter(emitter, {}, {}, 'test.xml'));
      emitter.emit('test start', test);
      emitter.emit('test skip', test);
      assert.isOk(fsStub.appendFileSync.called);
    });
  });

  describe('when test fails', () => {
    before(() => {
      test = {
        status: 'failed',
        title: 'Failed Test',
      };
    });

    beforeEach(() => sinon.stub(fsStub, 'appendFileSync'));

    afterEach(() => fsStub.appendFileSync.restore());

    it('should write a failed test', () => {
      const emitter = new EventEmitter();
      (new XUnitReporter(emitter, {}, {}, 'test.xml'));
      emitter.emit('test start', test);
      emitter.emit('test fail', test);
      assert.isOk(fsStub.appendFileSync.called);
    });
  });

  describe('when test errors', () => {
    before(() => {
      test = {
        status: 'error',
        title: 'Errored Test',
      };
    });

    beforeEach(() => sinon.stub(fsStub, 'appendFileSync'));

    afterEach(() => fsStub.appendFileSync.restore());

    it('should write an error test', () => {
      const emitter = new EventEmitter();
      (new XUnitReporter(emitter, {}, {}, 'test.xml'));
      emitter.emit('test start', test);
      emitter.emit('test error', new Error('Error'), test);
      assert.isOk(fsStub.appendFileSync.called);
    });
  });
});
