<!-- Note that this readme is embedded on API Documentation page within Streamr. Please don't use first-level headings (h1). You should write this document so that it will work both as a stand-alone document in the public GitHub repo and as a section in the API docs. -->
<a name="js-client"></a>
## Streamr Javascript Client

By using this client, you can easily subscribe to realtime [Streamr](http://www.streamr.com) streams from Javascript-based environments, such as browsers and [node.js](https://nodejs.org). This enables you to use Streamr as an over-the-internet pub/sub engine with powerful analytics and automation features.

The client uses [socket.io](http://socket.io/) under the hood for streaming message delivery. It works in virtually all browsers by using websockets where available, or fallback methods on legacy browsers.

### Installation

The client is available on [npm](https://www.npmjs.com/package/streamr-client) and can be installed simpy by:

`npm install streamr-client`

### Usage

Here's a quick example. More detailed examples for the browser and node.js can be found [here](https://github.com/streamr-dev/streamr-client/tree/master/examples).

```javascript
// Create a StreamrClient instance
var client = new StreamrClient({
    // See below for connection options
})

// Subscribe to a stream
var sub = client.subscribe(
    'stream-id',
    function(message, streamId, timestamp, counter) {
        // Do something with a message, which is an object
    },
    {
        // Resend options, see below
    }
)
```

### Handling messages

The second argument to `client.subscribe(streamId, callback, resendOptions)` is the callback function that will be called for each message as they arrive. Its arguments are as follows:

Argument | Description
-------- | -----------
message  | A javascript object containing the message itself
streamId | The id of the stream the message belongs to
timestamp| (optional) A javascript Date object containing the timestamp for this message, if available.
counter  | (optional) A sequence number for this message, if available.


### Connection options

Option | Default value | Description
------ | ------------- | -----------
url | ws://www.streamr.com/api/v1/ws | Address of the Streamr websocket endpoint to connect to.
autoConnect | true | If set to `true`, the client connects automatically on the first call to `subscribe()`. Otherwise an explicit call to `connect()` is required.
autoDisconnect | true  | If set to `true`, the client automatically disconnects when the last stream is unsubscribed. Otherwise the connection is left open and can be disconnected explicitly by calling `disconnect()`.

### Resend options

Note that only one of the resend options can be used for a particular subscription. The default functionality is to resend nothing, only subscribe to messages from the subscription moment onwards.

Option | Default value | Description
------ | ------------- | -----------
resend_all | undefined | Set to `true` if you want all the messages for the stream resent from the earliest available message.
resend_last | undefined | Resend the previous `N` messages.
resend_from | undefined | Resend from a specific message number.
resend_from_time | undefined | Resend from a specific Date (or millisecond timestamp).
resend_to | undefined | Can be used in conjunction with `resend_from` to limit the end of the resend. By default it is the newest message.

### Methods

Name | Description
---- | -----------
connect() | Connects to the server, and also subscribes to any streams for which `subscribe()` has been called before calling `connect()`.
disconnect() | Disconnects from the server, clearing all subscriptions.
pause() | Disconnects from the server without clearing subscriptions.
subscribe(streamId, callback, resendOptions) | Subscribes to a stream identified by the string `streamId`. Messages in this stream are passed to the `callback` function. See the above table for `resendOptions`. Returns a `Subscription` object.
unsubscribe(Subscription) | Unsubscribes the given `Subscription`.
unsubscribeAll(`streamId`) | Unsubscribes all `Subscriptions` for `streamId`.
getSubscriptions(`streamId`) | Returns a list of `Subscriptions` for `streamId`.
bind(eventName, function) | Binds a `function` to an event called `eventName`
unbind(eventName, function) | Unbinds the `function` from events called `eventName`

### Binding to events

The client and the subscriptions can fire events as detailed below. You can bind to them using `bind`:

```javascript
	function hello() {
		console.log('Hello!')
	}

	client.bind('connected', hello)

	var sub = client.subscribe(...)
	sub.bind('subscribed', function() {
		console.log('Subscribed to '+sub.streamId)
	})
```

You can unbind using `unbind`:

```javascript
	client.unbind('connected', hello)
```


### Events on the StreamrClient instance

Name | Handler Arguments | Description
---- | ----------------- | -----------
connected |  | Fired when the client has connected (or reconnected).
disconnected |  | Fired when the client has disconnected (or paused).

### Events on the Subscription object

Name | Handler Arguments | Description
---- | ----------------- | -----------
subscribed | {from: number} | Fired when a subscription request is acknowledged by the server.
unsubscribed |  | Fired when an unsubscription is acknowledged by the server.
resending |  | Fired when the subscription starts resending.
resent |  | Fired after `resending` when the subscription has finished resending.
no_resend |  | Fired after `resending` in case there was nothing to resend.

### Logging

The Streamr JS client library supports [debug](https://github.com/visionmedia/debug) for logging.

In node.js, start your app like this: `DEBUG=StreamrClient node your-app.js`

In the browser, include `debug.js` and set `localStorage.debug = 'StreamrClient'`
