/**
 * A FreeDOM interface to WebRTC Peer Connections
 * @constructor
 * @private
 */
var PeerConnection_unprivileged = function(channel) {
  this.appChannel = channel;
  this.dataChannel = null;
  this.identity = null;
  this.connection = null;
  handleEvents(this);
};

PeerConnection_unprivileged.prototype.open = function(proxy, id, continuation) {
  if (this.connection) {
    continuation(false);
  }

  // Listen for messages to/from the provided message channel.
  this.appChannel = Core_unprivileged.bindChannel(proxy);
  this.appChannel['on']('message', this.onIdentity.bind(this));
  this.appChannel['emit']('ready');

  var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;
  this.connection = new RTCPeerConnection(null, {'optional': [{'RtpDataChannels': true}]});
  this.dataChannel = this.connection.createDataChannel("sendChannel", {'reliable': false});
  
  this.dataChannel.addEventListener('open', function() {
    this.emit('open');
  }.bind(this), true);
  this.dataChannel.addEventListener('message', function(m) {
    // TODO(willscott): Handle receipt of binary data.
    this['dispatchEvent']('message', {"text": m.data});
  }.bind(this), true);
  this.dataChannel.addEventListener('close', function() {
    this['dispatchEvent']('onClose');
    this.close(function() {});
  }.bind(this), true);

  this.connection.addEventListener('icecandidate', function(evt) {
    if(evt && evt['candidate']) {
      this.appChannel.postMessage({
        'type': 'message',
        'action': 'event',
        'data': JSON.stringify(evt['candidate'])
      });
    }
  }.bind(this), true);

  this.connection.createOffer(function(desc) {
    this.connection.setLocalDescription(desc);
    this.appChannel.postMessage({
      'type': 'message',
      'action': 'event',
      'data': JSON.stringify(desc)
    });
  }.bind(this));

  continuation();
};

PeerConnection_unprivileged.prototype.onIdentity = function(msg) {
  try {
    var m = JSON.parse(msg.data);
    if (m['candidate']) {
      var candidate = new RTCIceCandidate(m);
      this.connection.addIceCandidate(candidate);
    } else {
      this.connection.setRemoteDescription(new RTCSessionDescription(m));
    }
  } catch(e) {
    console.log("Couldn't understand identity message: " + JSON.stringify(msg));
  }
}

PeerConnection_unprivileged.prototype.postMessage = function(ref, continuation) {
  if (!this.connection) {
    return continuation(false);
  }
  // Queue until open.
  if (this.dataChannel.readyState != "open") {
    return this.once('open', this.postMessage.bind(this, ref, continuation));
  }

  // TODO(willscott): Handle send of binary data.
  this.dataChannel.send(ref);
  continuation();
};

PeerConnection_unprivileged.prototype.close = function(continuation) {
  delete this.dataChannel;

  if (this.connection) {
    this.connection.close();
  }
  continuation();
};

fdom.apis.register("core.peerconnection", PeerConnection_unprivileged);
